import fetch from "node-fetch"
import { parse } from 'node-html-parser'

import puppeteer from "puppeteer-extra"
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import flat from 'flat'

import fs from "fs"

import requestretry from 'requestretry'

// parse from bioentity
function copyToClipboard(text) { if (window.clipboardData && window.clipboardData.setData) return window.clipboardData.setData("Text", text);
    else if (document.queryCommandSupported && document.queryCommandSupported("copy")) { var textarea = document.createElement("textarea");
        textarea.textContent = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select(); try { return document.execCommand("copy") } catch (ex) { console.warn("Copy to clipboard failed.", ex); return prompt("Copy to clipboard: Ctrl+C, Enter", text) } finally { document.body.removeChild(textarea) } } };
function copyDrugBankDrug() {
    let answer = "";
    let drugs = [];
    let actions = [];
    let title = document.querySelectorAll('.card-content > dl > dd')[0]?.textContent;
    let id = window.location.href.split('/').slice(-1)[0];
    const rows = document.querySelectorAll('#target-relations > tbody > tr');
    console.log(rows.length);
    rows.forEach(row => { col = row.querySelectorAll('td');
        drugs.push(col[0]?.textContent);
        actions.push(col[4]?.textContent) });
    answer = title + '\t' + id + '\t' + drugs.join('\;') + '\t' + actions.join(';');
    copyToClipboard(answer);
}


const fetchAsync = async(url) => (
        await requestretry({
            url: url,
            fullResponse: false,
            maxAttempts: 10,  // (default) try 5 times 
            retryDelay: 500, // (default) wait for 5s before trying again
            retrySrategy: requestretry.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
          }).then(async (res) => {
            // console.log(url)
            // await new Promise(resolve => setTimeout(resolve, 200))
            return res
          }).catch((error) => {
            console.log({error})
            return 'error'
          })
)

const getBioEnity = async(id) => {
    const res = await fetchAsync(`https://go.drugbank.com/bio_entities/${id}`)
    const document = parse(res)

    const name = document.querySelectorAll('.card-content dt#name + dd')[0]?.textContent || ""
    const kind = document.querySelectorAll('.card-content dt#kind + dd')[0]?.textContent || ""
    const organism = document.querySelectorAll('.card-content dt#organism + dd')[0]?.textContent || ""

    const proteins = document.querySelectorAll('#details-header + dl > dd:last-child tbody tr').map(row => (
        !row ? {} : {
            name: row.querySelector('td:nth-of-type(1)')?.textContent || "",
            uniprotId: row.querySelector('td:nth-of-type(2)')?.textContent || "",
            id: row.querySelector('td:nth-of-type(3) a')?.getAttribute('href').split('/')[2] || ""
        }
    ))

    const drugs = document.querySelectorAll('#target-relations > tbody > tr').map(row => (
        !row ? {} : {
            id: row.querySelector('td:nth-of-type(1)')?.textContent || "",
            name: row.querySelector('td:nth-of-type(2)')?.textContent || "",
            group: row.querySelector('td:nth-of-type(3)')?.textContent || "",
            pharmAction: row.querySelector('td:nth-of-type(4)')?.textContent || "",
            action: row.querySelector('td:nth-of-type(5)')?.textContent || ""
        }
    ))
    

    return {
        id,
        name,
        kind,
        organism,
        proteins,
        drugs
    }
}

const getDrug = async(id) => {
    console.log(id)
    if (!id.length) { return undefined }
    let res = await fetchAsync(`https://go.drugbank.com/drugs/${id}`)
    if (!res) res = await fetchAsync(`https://go.drugbank.com/drugs/${id}`)
    const document = parse(res)
    
    const drugBankId = document.querySelector('#identification-header + dl #drugbank-accession-number + dd')?.textContent || ''
    const summary = document.querySelector('#identification-header + dl #summary + dd')?.textContent || ''
    const brandNames = document.querySelector('#identification-header + dl #brand-names + dd')?.textContent || ''
    const genericName = document.querySelector('#identification-header + dl #generic-name + dd')?.textContent || ''
    const type = document.querySelector('#identification-header + dl #type + dd')?.textContent || ''
    const groups = document.querySelector('#identification-header + dl #groups + dd')?.textContent || ''
    const molecularWeight = document.querySelector('#identification-header + dl #weight + dd')?.textContent.match(/Average: ([0-9]*\.[0-9]*)/)?.at(1) || ''
    const chemicalFormula = document.querySelector('#identification-header + dl #chemical-formula + dd')?.textContent || ''

    const volumeOfDistribution = document.querySelector('#pharmacology-header + dl #volume-of-distribution + dd')?.textContent || ''
    const halfLife = document.querySelector('#pharmacology-header + dl #half-life + dd')?.textContent || ''
    const clearance = document.querySelector('#pharmacology-header + dl #clearance + dd')?.textContent.replace('\n','').trim() || ''
    const toxicity = document.querySelector('#pharmacology-header + dl #toxicity + dd')?.textContent || ''
    const pathways = Array.from(document.querySelectorAll('#pharmacology-header + dl #pathways + dd tbody tr')).map(pathway => (
        !pathway ? {} : {
        link: pathway.querySelector('td:nth-of-type(1) a')?.getAttribute('href') || '',
        name: pathway.querySelector('td:nth-of-type(1) a')?.textContent || '',
        category: pathway.querySelector('td:nth-of-type(2)')?.textContent || ''
    }))

    const smiles = document.querySelector('#chemical-identifiers-header + dl #smiles + dd')?.textContent || ''
    const inChI = document.querySelector('#chemical-identifiers-header + dl #inchi + dd')?.textContent || ''
    const inChIKey = document.querySelector('#chemical-identifiers-header + dl #inchi-key + dd')?.textContent || ''

    const externalLinks = {}
    let tempAttrs = document.querySelectorAll('#references-header + dl #external-links + dd dt')
    let tempValues = document.querySelectorAll('#references-header + dl #external-links + dd dd')
    tempAttrs.forEach((el, index) => {
        if (el) {
            Object.defineProperty(externalLinks, el.textContent, {
                value: tempValues[index]?.textContent,
                enumerable: true
            })
        }
    })

    const state = document.querySelector('#properties-header + dl #state + dd')?.textContent || ''

    let propertiesExperimental = {}
    Array.from(document.querySelectorAll('#properties-header + dl #experimental-properties + dd tbody tr')).forEach(row => {
        if (row) {
            Object.defineProperty(propertiesExperimental, row.querySelector('td:nth-of-type(1)')?.textContent || '', {
                value: row.querySelector('td:nth-of-type(2)')?.textContent || '',
                enumerable: true,
                configurable: true
            })
        }
    })

    let propertiesPredicted = {}
    Array.from(document.querySelectorAll('#properties-header + dl #predicted-properties + dd tbody tr')).forEach(row => {
        if (row) {
            Object.defineProperty(propertiesPredicted, row.querySelector('td:nth-of-type(1)')?.textContent || '', {
                value: row.querySelector('td:nth-of-type(2)')?.textContent || '',
                enumerable: true,
                configurable: true
            })
        }
    })
      
    
    let propertiesAdmet = {}
    Array.from(document.querySelectorAll('#properties-header + dl #predicted-admet-features + dd tbody tr')).forEach(row => {
        if (row) {
            Object.defineProperty(propertiesAdmet, row.querySelector('td:nth-of-type(1)')?.textContent || '', {
                value: row.querySelector('td:nth-of-type(2)')?.textContent || '',
                enumerable: true,
                configurable: true
            })
        }
    })

    const phases = Array.from(document.querySelectorAll('#clinical-trials-header + dl tbody tr'))?.map(row=> {
        if (!row) return ''
        const result = row.querySelector('td:nth-of-type(2)')?.textContent || ''
        const phases = row.querySelector('td:nth-of-type(1)')?.textContent || ''
        if (result === 'Completed') return Math.max(...phases.match(/\d+/g)?.map(ii => parseInt(ii)) || []) || ''
        return ''
    }) || []
    const maxPhase = phases.length ? Math.max(...phases) : ''

    const targets = Array.from(document.querySelectorAll('#targets .bond.card')).map(target => (
        !target ? {} : {
        name: target.querySelector('.card-header')?.textContent.replace('\n\n\n Details','') || '',
        BEId: target.getAttribute('id') || '',
        PId: target.querySelector('.card-header strong a')?.getAttribute('href')?.split('/').splice(-1)[0] || '',
        actions: target.querySelector('#actions + dd')?.textContent || '',
        gene: target.querySelector('#gene-name + dd')?.textContent || '',
    }))

    const enzymes = Array.from(document.querySelectorAll('#enzymes .bond.card')).map(enzyme => (
        !enzyme ? {} : {
        name: enzyme.querySelector('.card-header')?.textContent.replace('\n\n\n Details','') || '',
        BEId: enzyme.getAttribute('id') || '',
        PId: enzyme.querySelector('.card-header strong a')?.getAttribute('href')?.split('/').splice(-1)[0] || '',
        actions: enzyme.querySelector('#actions + dd')?.textContent || '',
        gene: enzyme.querySelector('#gene-name + dd')?.textContent || '',
    }))

    const back = {
        general: {
            id:drugBankId,
            genericName,
            summary,
            brandNames,
            type,
            groups,
            inChI,
            inChIKey,
            toxicity,
            maxPhase,
        },
        biochemical: {
            volumeOfDistribution,
            halfLife,
            clearance,
            state,
            smiles,
            molecularWeight,
            chemicalFormula,
        },
        
        pathways,
        externalLinks,

        propertiesExperimental,
        propertiesPredicted,
        propertiesAdmet,

        targets,
        enzymes
    }

    return back
}

const getPharmaco = async(document) => {
    // change="increased" / "decreased"
    // what="proteomics" / "transcriptomics"

    // {gene="",  change="", what="transcriptomics"}
    // const res = await fetchAsync(`https://go.drugbank.com/pharmaco/${what}?q%5Bg%5B0%5D%5D%5Bm%5D=or&q%5Bg%5B0%5D%5D%5Bdrug_approved_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_nutraceutical_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_illicit_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_investigational_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_withdrawn_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_experimental_true%5D=all&q%5Bg%5B1%5D%5D%5Bm%5D=or&q%5Bg%5B1%5D%5D%5Bdrug_available_in_us_true%5D=all&q%5Bg%5B1%5D%5D%5Bdrug_available_in_ca_true%5D=all&q%5Bg%5B1%5D%5D%5Bdrug_available_in_eu_true%5D=all&commit=Apply+Filter&q%5Bdrug_precise_names_name_cont%5D=&q%5Bgene_symbol_eq%5D=${gene}&q%5Bgene_id_eq%5D=&q%5Bchange_eq%5D=${change}&q%5Binteraction_cont%5D=&q%5Bchromosome_location_cont%5D=`)
    // const document = parse(res)

   
    const drugs = Array.from(document.querySelectorAll(
        '.table-gene-regulations tbody tr, .table-protein-regulations tbody tr'
    ))?.map(row => (
        !row ? {} : {
            name: row.querySelector('td:nth-of-type(1)')?.textContent || "",
            id: row.querySelector('td:nth-of-type(1) a')?.getAttribute('href').split('/')[2] || "",
            groups: Array.from(row.querySelectorAll('td:nth-of-type(2) span')).map(i => i?.textContent || ""),
            gene: row.querySelector('td:nth-of-type(3)')?.textContent || "",
            geneId: row.querySelector('td:nth-of-type(4)')?.textContent || "",
            change: row.querySelector('td:nth-of-type(5)')?.textContent.replace('\n', '').trim() || "",
            interaction: row.querySelector('td:nth-of-type(6)')?.textContent || "",
            chromosome: row.querySelector('td:nth-of-type(7)')?.textContent || "",
            references: Array.from(row.querySelectorAll('td:nth-of-type(8) li')).map(article => article?.textContent || "")
        }
    )) || []

    return drugs || []
}

const getArticle = async(id) => {
    // TODO: release
    const res = await fetchAsync(`https://go.drugbank.com/articles/${id}`)
    const document = parse(res)

    const authors = document.querySelector('#article-details-header + dl #citation + dd > p:nth-of-type(1)')?.textContent || ""
    const title = document.querySelector('#article-details-header + dl #citation + dd > p:nth-of-type(2)')?.textContent || ""
    const journal = document.querySelector('#article-details-header + dl #citation + dd > p:nth-of-type(3)')?.textContent || ""
    const pubMedId = document.querySelector('#article-details-header + dl #pubmed-id + dd a')?.getAttribute('href')?.split('/').slice(-1)[0] || ""
    const abstract = document.querySelector('#article-details-header + dl #abstract + dd > p')?.textContent || ""
    
    return {
        id,
        authors, 
        title,
        journal,
        pubMedId,
        abstract
    }
}

const getIndication = async(id) => {
    // TODO: release
    const res = await fetchAsync(`https://go.drugbank.com/indications/${id}`)
    const document = parse(res)

    const back = {}
    return back
}

const getProtein = async(id) => {
    const res = await fetchAsync(`https://go.drugbank.com/polypeptides/${id}`)
    const document = parse(res)

    const name = document.querySelector('.card-content dt#name + dd')?.textContent || ""
    const synonyms = document.querySelectorAll('.card-content dt#synonyms + dd li').map(i => i?.textContent || "") || []
    const gene = document.querySelector('.card-content dt#gene-name + dd')?.textContent || ""
    const acSeq = document.querySelector('.card-content dt#amino-acid-sequence + dd')?.textContent || ""
    const residues = document.querySelector('.card-content dt#number-of-residues + dd')?.textContent || ""
    const weight = document.querySelector('.card-content dt#molecular-weight + dd')?.textContent || ""
    const pi = document.querySelector('.card-content dt#theoretical-pi + dd')?.textContent || ""
    const GOFunctions = document.querySelectorAll('.card-content dt#go-classification + dd > .card > .card-body:nth-of-type(2) .separated-list-item').map(i => i?.textContent || "") || []
    const GOProcesses = document.querySelectorAll('.card-content dt#go-classification + dd > .card > .card-body:nth-of-type(4) .separated-list-item').map(i => i?.textContent || "") || []
    const GOComponents = document.querySelectorAll('.card-content dt#go-classification + dd > .card > .card-body:nth-of-type(6) .separated-list-item').map(i => i?.textContent || "") || []

    const generalFunction = document.querySelector('.card-content dt#general-function + dd')?.textContent || ""
    const specificFunction = document.querySelector('.card-content dt#specific-function + dd')?.textContent || ""

    const pfamDomainFunction = document.querySelectorAll('.card-content dt#pfam-domain-function + dd li').map(row => (
        !row ? {} : {
            title: row.textContent || "",
            id: row.querySelector('a')?.textContent || ""
        }
    ))
   
    const transmembraneRegions = document.querySelector('.card-content dt#transmembrane-regions + dd')?.textContent || ""
    const cellularLocation = document.querySelector('.card-content dt#cellular-location + dd')?.textContent || ""
    const chromosomeLocation = document.querySelector('.card-content dt#chromosome-location + dd')?.textContent || ""
    const locus = document.querySelector('.card-content dt#locus + dd')?.textContent || ""

    const externalIdentifiers = {}
    document.querySelectorAll('.card-content dt#external-identifiers + dd tbody tr').forEach(i => {
        const props = i?.querySelectorAll('td').map(ii => ii?.textContent || "") || []
        Object.defineProperty(externalIdentifiers, props[0], {
            value: props[1],
            enumerable: true,
            configurable: true
        })
    })

    const articles = document.querySelectorAll('.card-content dt#general-references + dd li').map(row => (
        !row ? {} : {
            title: row.textContent || "",
            id: row.querySelector('a')?.getAttribute('href').split('/')[2] || ""
        }
    ))

    const drugs = document.querySelectorAll('#target-relations > tbody > tr').map(row => (
        !row ? {} : {
            id: row.querySelector('td:nth-of-type(1)')?.textContent || "",
            name: row.querySelector('td:nth-of-type(2)')?.textContent || "",
            group: row.querySelector('td:nth-of-type(3)')?.textContent || "",
            pharmAction: row.querySelector('td:nth-of-type(4)')?.textContent || "",
            action: row.querySelector('td:nth-of-type(5)')?.textContent || ""
        }
    ))

    const back = {
        id,
        name,
        synonyms,
        gene,
        acSeq,
        residues,
        weight,
        pi,
        GO: {
            GOFunctions,
            GOProcesses,
            GOComponents
        },
        generalFunction,
        specificFunction,
        pfamDomainFunction,
        transmembraneRegions,
        cellularLocation,
        chromosomeLocation,
        locus,
        externalIdentifiers,

        articles,
        drugs
    }
    // console.log(back)
    return back
}


const getMolsFromPubChem = async (document) => {
    const cid = document.querySelector('.summary tbody tr:nth-of-type(1) td')?.textContent || ''
    const synonyms = Array.from(document.querySelectorAll('.summary tbody tr:nth-of-type(4) td p')).map(i => i?.textContent || '').join(';!')
    const inChIKey = document.querySelector('#Names-and-Identifiers #InChI-Key .section-content-item p')?.textContent || ''
    const canonicalSmiles = document.querySelector('#Names-and-Identifiers #Canonical-SMILES .section-content-item p')?.textContent || ''
    const molecularFormula = document.querySelector('#Names-and-Identifiers #Molecular-Formula .section-content-item p')?.textContent || ''

    const phases = Array.from(document.querySelectorAll('#Drug-and-Medication-Information #ClinicalTrials-gov tbody tr'))?.map(row=> {
        if (!row) return ''
        const result = row.querySelector('td:nth-of-type(4)')?.textContent || ''
        const phases = row.querySelector('td:nth-of-type(3)')?.textContent || ''
        if (result === 'Completed') return Math.max(...phases.match(/\d+/g)?.map(ii => parseInt(ii)) || []) || ''
        return ''
    }) || []
    const maxPhase = phases.length ? Math.max(...phases) : ''


    let chemicalProperties = {}
    Array.from(document.querySelectorAll('#Computed-Properties tbody tr')).forEach(row => {
        if (row) {
            Object.defineProperty(chemicalProperties, row.querySelector('td:nth-of-type(1)')?.textContent || '', {
                value: row.querySelector('td:nth-of-type(2)')?.textContent || '',
                enumerable: true,
                configurable: true
            })
        }
    })

    return {
        cid,
        synonyms,
        inChIKey,
        canonicalSmiles,
        molecularFormula,
        chemicalProperties,
        maxPhase
    }
}


const runPubchemMol = async (cids) => {
    puppeteer
    .use(StealthPlugin())
    .use(AdblockerPlugin({ blockTrackers: true }))
    .launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    .then(async browser => {
        const page = await browser.newPage()
        page.setDefaultNavigationTimeout(0)
        let infoList = []
        let mols = []
        for (let cid of cids) {
            if (cid) {
                await page.goto(`https://pubchem.ncbi.nlm.nih.gov/compound/${cid}#section=Clinical-Trials`)
                await page.waitForSelector('#Names-and-Identifiers', {timeout:0})
                await page.waitForTimeout(200)

                const mol = await page.$eval('body', getMolsFromPubChem)

                console.log(cid, mol)

                if (mol) {
                    mols.push(mol)
                } else {
                    mols.push({})
                }
            } else mols.push({})
        }
        
        await browser.close()

        mols = mols.map(i => flat(i))
        console.log(mols)
    
        let headerSet = new Set()
        mols.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
        headerSet = Array.from(headerSet).sort()
        console.log(headerSet)
    
        const header = headerSet.join('\t')
        const rows = mols.map(i => headerSet.map(ii => {
            console.log(i[ii], typeof i[ii], ii)
            if (!i[ii]) return ''
            if ((typeof i[ii] !== 'string') && (typeof i[ii] !== 'number')) return ''
            return i[ii].toString().replace(/(?:\r\n|\r|\n)/g,'').trim()
        }).join('\t'))
        const toSave = [header].concat(rows).join('\n')
    
        fs.writeFile('./data/molsInfo.tsv', toSave, (error) => {console.log(error)})
    })
}


const saveToTSV = (dataObject, fileName) => {
    const headings = Object.keys(dataObject[0]).join('\t');
    const rows = dataObject.reduce((acc, c) => {
        return acc.concat([Object.values(c).join('\t')]);
    }, [])
    
    // console.log({rows}, typeof rows)
    // let data = [headings].concat(rows)
    // console.log({data}, typeof data)
    let data = rows.join('\n')
    // data = data.join('\n')

    // var logger = fs.createWriteStream('test.tsv', {
    //     flags: 'a' // 'a' means appending (old data will be preserved)
    //   })

    // logger.write(data)
    fs.writeFile(fileName, data, (erorr)=>{console.log(erorr)})
}

const saveToTSVWithFlat = (preData, fileName) => {
    // console.log({preData})
    let data = preData.map(i => flat(i))
    // console.log({data})

    let headerSet = new Set()
    data.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log({headerSet})

    const header = headerSet.join('\t')
    const rows = data.map(i => headerSet.map(ii => {
        // console.log(i[ii], typeof i[ii], ii)

        if (!i[ii]) return ''
        if ((typeof i[ii] !== 'string') && (typeof i[ii] !== 'number')) return ''
        return i[ii].toString().replace(/(?:\r\n|\r|\n)/g,'').trim()
    }).join('\t'))
    const toSave = [header].concat(rows).join('\n')
    // console.log({toSave})

    fs.writeFile(fileName, toSave, (error) => {console.log(error)})
}


const runDrugBankPharmaco = (genes) => {
    puppeteer
    .use(StealthPlugin())
    .use(AdblockerPlugin({ blockTrackers: true }))
    .launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    .then(async browser => {
        const page = await browser.newPage()
        page.setDefaultNavigationTimeout(0)

        let infoList = []
        let drugs
        for (let what of whats) {
            for (let gene of genes) {
                await page.waitForTimeout(2000)
                await page.goto(`https://go.drugbank.com/pharmaco/${what}?q%5Bg%5B0%5D%5D%5Bm%5D=or&q%5Bg%5B0%5D%5D%5Bdrug_approved_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_nutraceutical_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_illicit_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_investigational_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_withdrawn_true%5D=all&q%5Bg%5B0%5D%5D%5Bdrug_experimental_true%5D=all&q%5Bg%5B1%5D%5D%5Bm%5D=or&q%5Bg%5B1%5D%5D%5Bdrug_available_in_us_true%5D=all&q%5Bg%5B1%5D%5D%5Bdrug_available_in_ca_true%5D=all&q%5Bg%5B1%5D%5D%5Bdrug_available_in_eu_true%5D=all&commit=Apply+Filter&q%5Bdrug_precise_names_name_cont%5D=&q%5Bgene_symbol_eq%5D=${gene}&q%5Bgene_id_eq%5D=&q%5Bchange_eq%5D=${change}&q%5Binteraction_cont%5D=&q%5Bchromosome_location_cont%5D=`)
                await page.waitForSelector('.table-gene-regulations, .table-protein-regulations', {timeout:0})

                drugs = await page.$eval('body', getPharmaco)

                console.log(drugs.length, gene, what)

                if (drugs.length) {
                    drugs = await Promise.all(drugs.map(async drug => ({
                            ...drug,
                            articles: await Promise.all(drug.references.map(async article => await getArticle(article)))  
                        }
                    )))

                    const info = drugs.map(drug => ({
                        gene,
                        what,
                        geneId: drug.geneId,
                        geneChange: drug.change,
                        chromosome: drug.chromosome,
                        drugName: drug.name,
                        drugId: drug.id,
                        drugGrups: drug.groups.join(";!"),
                        drugInteraction: drug.interaction,
                        drugArticlesId: drug.references.join(";!"),
                        drugArticlesTitles: drug.articles.map(atricle => atricle.title).join(";!"),
                        drugArticlesPubmedId:drug.articles.map(atricle => atricle.pubMedId).join(";!"),
                        drugArticlesAbstracts:drug.articles.map(atricle => atricle.abstract).join(":!")
                    }))
                    infoList = infoList.concat(info)
                }
            }
        }

        saveToTSV(infoList, 'pharmaco.tsv')
        await browser.close()
    })
}

const runDrugBankBEProteinsOnly = async(entityList) => {
    const infoList = await Promise.all(entityList.map(async entity => {
        console.log(entity)
        if (!entity) return {}
        const bioEnity = await getBioEnity(entity)
        // console.log(bioEnity)

        return {
            id: bioEnity.id,
            proteinsNames: bioEnity.proteins.map(i => i?.name || '').join(';!'),
            proteinsID: bioEnity.proteins.map(i => i?.id || '').join(';!')
        }
    }))

    saveToTSVWithFlat(infoList, 'BEProteinsOnly.tsv')
}

const runDrugBankEntities = async(entityList) => {
    entityList.map(async entity => {
        const bioEnity = await getBioEnity(entity)
        console.log(bioEnity)
        const proteins = await Promise.all(
            bioEnity.proteins.map(async protein => await getProtein(protein.id))
        )
        console.log(proteins)
    })
}

const runDrugBankProteinsForBE = async (entityList) => {
    let infoList = []
    for (const entity of entityList) {
        console.log(entity)
        if (entity) {
            const bioEnity = await getBioEnity(entity)
            // console.log({bioEnity})
            const proteins = await Promise.all(
                bioEnity.proteins.map(async protein => protein.id ? await getProtein(protein.id) : {})
            )
            // console.log({proteins})
            
            const result = proteins.map(protein => {
                const {drugs, articles, pfamDomainFunction, synonyms, GO, ...newObj} = protein
                return {
                    BEid: entity,
                    ...newObj,
                    synonyms: synonyms.join(";!"),
                    'articles.ids': articles.map(article => article?.id || '').join(";!"),
                    'articles.titles': articles.map(article => article?.title || '').join(";!"),
                    'pfamDomainFunction.ids': pfamDomainFunction.map(funct => funct?.id || '').join(";!"),
                    'pfamDomainFunction.titles': pfamDomainFunction.map(funct => funct?.title || '').join(";!"),
                    'GO.Components': GO.GOComponents.join(";!"),
                    'GO.Processes': GO.GOProcesses.join(";!"),
                    'GO.Functions': GO.GOFunctions.join(";!")
            }})
            // console.log({result})
            infoList = infoList.concat(result)
        }
    }

    console.log({infoList})

    saveToTSVWithFlat(infoList, './data/ProteinsForBE.tsv')
}

const runDrugBankProteins = async (proteinList) =>{
    const proteins = await Promise.all(proteinList.map(async protein => (protein ? await getProtein(protein) : {})))
        
    const result = proteins.map(protein => {
        const {drugs, articles, pfamDomainFunction, synonyms, GO, ...newObj} = protein
        return {
            ...newObj,
            synonyms: synonyms.join(";!"),
            'articles.ids': articles.map(article => article?.id || '').join(";!"),
            'articles.titles': articles.map(article => article?.title || '').join(";!"),
            'pfamDomainFunction.ids': pfamDomainFunction.map(funct => funct?.id || '').join(";!"),
            'pfamDomainFunction.titles': pfamDomainFunction.map(funct => funct?.title || '').join(";!"),
            'GO.Components': GO.GOComponents.join(";!"),
            'GO.Processes': GO.GOProcesses.join(";!"),
            'GO.Functions': GO.GOFunctions.join(";!")
    }})

    console.log({result})

    saveToTSVWithFlat(result, './data/Proteins.tsv')
}

const runDrugBankDrugsForBEandProteins = async(entityList) => {
    let infoList = []
    for (const entity of entityList) {
        console.log(entity)
        if (entity) {
            const bioEnity = await getBioEnity(entity)
            // console.log(bioEnity)

            const BEDrugs = bioEnity.drugs.map(drug => ({
                BEId: entity,
                proteinId: '',
                ...drug
            }))
            // console.log({BEDrugs})
            infoList = infoList.concat(BEDrugs)
            
            bioEnity.proteins.forEach(async protein => {
                const proteins = await getProtein(protein.id)
                // console.log(proteins)

                const proteinDrugs = proteins.drugs.map(drug => ({
                    BEId: entity,
                    proteinId: protein.id,
                    ...drug
                }))
                // console.log({proteinDrugs})
                infoList = infoList.concat(proteinDrugs)
            })
        }
    }

    // console.log({infoList})

    saveToTSVWithFlat(infoList, './data/DrugsForBEandProteins.tsv')
}


const runDrugBankDrugsForProteins = async(proteinsList) => {
    let infoList = []
    for (const protein of proteinsList) {
        if (protein) {
            const proteins = await getProtein(protein)
            // console.log(proteins)

            const proteinDrugs = proteins.drugs.map(drug => ({
                BEId: '',
                proteinId: protein,
                ...drug
            }))
            // console.log({proteinDrugs})
            infoList = infoList.concat(proteinDrugs)
        }
    }

    console.log({infoList})

    saveToTSVWithFlat(infoList, './data/DrugsForProteins.tsv')
}


const runDrugBankArticles = async(articleList) => {
    const res = await getArticle('A20386')
    console.log(res)
}

    
const runDrugBankDrugs = async(drugList) => {
    console.log(drugList.length)
    
    let res = []
    const chankSize = 200
    const chanksNumber = Math.floor(drugList.length / chankSize)
    for (let i = 0; i <= chanksNumber; i++) {
        console.log(i*chankSize,(i+1)*chankSize)
        let list = drugList.slice(i*chankSize,(i+1)*chankSize)
        let tempRes = await Promise.all(list.map(async drugId => await getDrug(drugId)))
        // console.log(tempRes)
        res = res.concat(tempRes)
    }
    
    console.log(res)
    res = res.map(i => {
        if (!i) return {}
        const {targets, enzymes, pathways, ...newObj} = i
        return {
            ...newObj,
            'pathways.names': pathways.map(ii => ii.name).join(';!'),
            'pathways.links': pathways.map(ii => ii.link).join(';!'),
            'enzymes.names': enzymes.map(ii => ii.name).join(';!'),
            'targets.names': targets.map(ii => ii.name).join(';!'),
            'enzymes.PIds': enzymes.map(ii => ii.PId).join(';!'),
            'targets.PIds': targets.map(ii => ii.PId).join(';!'),
            'targets.genes': targets.map(ii => ii.gene).join(';!'),
            'enzymes.genes': enzymes.map(ii => ii.gene).join(';!'),
        }
    })
    // console.log(res)

    res = res.map(i => flat(i))
    // console.log(res)

    let headerSet = new Set()
    res.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log(headerSet)

    const header = headerSet.join('\t')
    const rows = res.map(i => headerSet.map(ii => {
        // console.log(i[ii], typeof i[ii], ii)
        if (!i[ii]) return ''
        if ((typeof i[ii] !== 'string') && (typeof i[ii] !== 'number')) return ''
        return i[ii].toString().replace(/(?:\r\n|\r|\n)/g,'').trim()
    }).join('\t'))
    // console.log(rows.length)
    const toSave = [header].concat(rows).join('\n')

    fs.writeFile('./data/drugsInfo.tsv', toSave, (error) => {console.log(error)})
}

const downloadDrugMol = async (row) => {
    if (!row.length) { return {} }

    const id = row.split('.')[0]
    const drugBankId = row.split('.')[1]

    let res = await fetchAsync(`https://go.drugbank.com/structures/small_molecule_drugs/${drugBankId}.mol`)
    let molSuccess = res.length > 0 && res !== 'error code: 1015'
    if (molSuccess) {
        fs.writeFile(`./data/ligands/mol/${row}.mol`, res, (error)=>{})
    }
    console.log(id, drugBankId)
    // console.log({molSuccess})

    res = await fetchAsync(`https://go.drugbank.com/structures/small_molecule_drugs/${drugBankId}.pdb`)
    let pdbSuccess = res.length > 0 && res !== 'error code: 1015'
    if (pdbSuccess) {
        fs.writeFile(`./data/ligands/pdb/${row}.pdb`, res, (error)=>{})
    }

    res = await fetchAsync(`https://go.drugbank.com/structures/small_molecule_drugs/${drugBankId}.sdf?type=3d`)
    let sdfSuccess = res.length > 0 && res !== 'error code: 1015'
    if (sdfSuccess) {
        fs.writeFile(`./data/ligands/3Dsdf/${row}.sdf`, res, (error)=>{})
    }

    return {
        id,
        drugBankId,
        molSuccess,
        pdbSuccess,
        sdfSuccess
    }
}

const downloadDrugBankMols = async (drugList) => {
    // console.log(drugList.length)
    
    let res = []
    const chankSize = 100
    const chanksNumber = Math.floor(drugList.length / chankSize)
    for (let i = 0; i <= chanksNumber; i++) {
        console.log(i*chankSize,(i+1)*chankSize)
        let list = drugList.slice(i*chankSize,(i+1)*chankSize)
        let tempRes = await Promise.all(list.map(async drugId => await downloadDrugMol(drugId)))
        // console.log(tempRes)
        res = res.concat(tempRes)

        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    // console.log(res)

    let headerSet = new Set()
    res.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log(headerSet)
    

    const header = headerSet.join('\t')
    const rows = res.map(i => headerSet.map(ii => (
        i[ii]?.toString() || ''
    )).join('\t'))
    // console.log(rows.length)
    const toSave = [header].concat(rows).join('\n')

    fs.writeFile('./data/ligandsInfo.tsv', toSave, (error) => {console.log(error)})
}


const downloadPubchemMol = async (row) => {
    if (!row.length) { return {} }

    const id = row.split('.')[0]
    const pubchemId = row.split('.')[1]

    let res = await fetchAsync(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/CID/${pubchemId}/record/SDF/?record_type=3d&response_type=save&response_basename=${row}`)
    let sdfSuccess = res.length > 0 && res !== 'error code: 1015' && res.substring(0, 7) !== 'Status:'

    if (sdfSuccess) {
        fs.writeFile(`./data/ligands/3Dsdf/${row}.sdf`, res, (error)=>{})
    }
    console.log(id, pubchemId)
    // console.log({sdfSuccess})
    // console.log({res})

    return {
        id,
        pubchemId,
        sdfSuccess
    }
}

const downloadPubchemMols = async (drugList) => {
    // console.log(drugList.length)
    
    let res = []
    const chankSize = 100
    const chanksNumber = Math.floor(drugList.length / chankSize)
    for (let i = 0; i <= chanksNumber; i++) {
        console.log(i*chankSize,(i+1)*chankSize)
        let list = drugList.slice(i*chankSize,(i+1)*chankSize)
        let tempRes = await Promise.all(list.map(async drugId => await downloadPubchemMol(drugId)))
        // console.log(tempRes)
        res = res.concat(tempRes)

        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    // console.log(res)

    let headerSet = new Set()
    res.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log(headerSet)
    

    const header = headerSet.join('\t')
    const rows = res.map(i => headerSet.map(ii => (
        i[ii]?.toString() || ''
    )).join('\t'))
    // console.log(rows.length)
    const toSave = [header].concat(rows).join('\n')

    fs.writeFile('./data/ligandsInfo.tsv', toSave, (error) => {console.log(error)})
}

const downloadZincMol = async (row) => {
    if (!row.length) { return {} }

    const id = row.split('.')[0]
    const zincId = row.split('.')[1]

    let res = await fetchAsync(`https://zinc.docking.org/substances/${zincId}.sdf`)
    let sdfSuccess = res.length > 0 && res !== 'error code: 1015' && res.substring(0, 1) !== 0 && !res.includes('This is not the page you were looking for.')

    if (sdfSuccess) {
        fs.writeFile(`./data/ligands/test/${row}.sdf`, res, (error)=>{})
    }
    console.log(id, zincId)
    // console.log({sdfSuccess})
    // console.log({res})

    return {
        id,
        zincId,
        sdfSuccess
    }
}

const downloadZincMols = async (drugList) => {
    // console.log(drugList.length)
    
    let res = []
    const chankSize = 100
    const chanksNumber = Math.floor(drugList.length / chankSize)
    for (let i = 0; i <= chanksNumber; i++) {
        console.log(i*chankSize,(i+1)*chankSize)
        let list = drugList.slice(i*chankSize,(i+1)*chankSize)
        let tempRes = await Promise.all(list.map(async drugId => await downloadZincMol(drugId)))
        // console.log(tempRes)
        res = res.concat(tempRes)

        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    // console.log(res)

    let headerSet = new Set()
    res.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log(headerSet)
    

    const header = headerSet.join('\t')
    const rows = res.map(i => headerSet.map(ii => (
        i[ii]?.toString() || ''
    )).join('\t'))
    // console.log(rows.length)
    const toSave = [header].concat(rows).join('\n')

    fs.writeFile('./data/ligandsInfo.tsv', toSave, (error) => {console.log(error)})
}

const downloadPubchemMolFromPage = async (row) => {
    if (!row.length) { return {} }

    const id = row.split('.')[0]
    const pubchemId = row.split('.')[1]

    let res = await fetchAsync(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/CID/${pubchemId}/record/SDF/?record_type=3d&response_type=save&response_basename=${row}`)
    let sdfSuccess = res.length > 0 && res !== 'error code: 1015' && res.substring(0, 7) !== 'Status:'

    if (sdfSuccess) {
        fs.writeFile(`./data/ligands/3Dsdf/${row}.sdf`, res, (error)=>{})
    }
    console.log(id, pubchemId)
    // console.log({sdfSuccess})
    // console.log({res})

    return {
        id,
        pubchemId,
        sdfSuccess
    }
}

const get3DsdfFromPubChem = async (document) => {
    try {
        document.querySelector('section#Structures > section:nth-of-type(2)').scrollIntoView()
    
    } catch {
        return ""
    }
}

const get3DsdfFromPubChem2 = async (document) => {
    try {
        document.querySelector('button[data-label="Download Section Menu: 3D-Conformer Open"]').click()
        const url = document.querySelector('a[data-label="Download Section: 3D-Conformer; SDF - Save"]').getAttribute('href')
        return url
    } catch {
        return ""
    }
}

const downloadPubchemMolsFromPage = async (rowsCur) => {
    puppeteer
    .use(StealthPlugin())
    .use(AdblockerPlugin({ blockTrackers: true }))
    .launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    .then(async browser => {
        const page = await browser.newPage()
        page.setDefaultNavigationTimeout(0)
        let summary = []
        for (let row of rowsCur) {
            if (row) {
                const id = row.split('.')[0]
                const cid = row.split('.')[1]

                await page.goto(`https://pubchem.ncbi.nlm.nih.gov/compound/${cid}#section=3D-Conformer`)
                await page.waitForSelector('#Structures', {timeout:0})
                await page.waitForTimeout(200)
                await page.$eval('body', get3DsdfFromPubChem)
                await page.waitForTimeout(1000)
                const url = await page.$eval('body', get3DsdfFromPubChem2)

                // console.log(cid, url)

                let sdfSuccess
                if (url) {
                    let res = await fetchAsync(`https://pubchem.ncbi.nlm.nih.gov/${url}`)
                    sdfSuccess = res.length > 0 && res !== 'error code: 1015' && res.substring(0, 7) !== 'Status:'

                    if (sdfSuccess) {
                        fs.writeFile(`./data/ligands/test/${row}.sdf`, res, (error)=>{})
                    }
                    console.log(id, cid)
                    // console.log({sdfSuccess})
                    // console.log({res}) 

                } else {
                    sdfSuccess = false
                }

                summary.push({
                    id,
                    cid,
                    sdfSuccess
                })

            } else summary.push({})
        }
        

        await browser.close()

        let headerSet = new Set()
        summary.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
        headerSet = Array.from(headerSet).sort()
        // console.log(headerSet)
        
        
        const header = headerSet.join('\t')
        const rows = summary.map(i => headerSet.map(ii => (
            i[ii]?.toString() || ''
            )).join('\t'))
        // console.log(rows.length)
        const toSave = [header].concat(rows).join('\n')
        
        fs.writeFile('./data/ligandsInfo.tsv', toSave, (error) => {console.log(error)})
    })
}

const downloadDrugBank3Dsdf = async (row) => {
    if (!row.length) { return {} }

    const id = row.split('.')[0]
    const drugBankId = row.split('.')[1]

    let res = await fetchAsync(`https://go.drugbank.com/structures/small_molecule_drugs/${drugBankId}.sdf`)
    let sdfSuccess = res.length > 0 && res !== 'error code: 1015'

    if (sdfSuccess) {
        fs.writeFile(`./data/ligands/test/${row}.sdf`, res, (error)=>{})
    }
    console.log(id, drugBankId)
    // console.log({sdfSuccess})
    // console.log({res})

    return {
        id,
        drugBankId,
        sdfSuccess
    }
}

const downloadDrugBank3Dsdfs = async (drugList) => {
    // console.log(drugList.length)
    
    let res = []
    const chankSize = 100
    const chanksNumber = Math.floor(drugList.length / chankSize)
    for (let i = 0; i <= chanksNumber; i++) {
        console.log(i*chankSize,(i+1)*chankSize)
        let list = drugList.slice(i*chankSize,(i+1)*chankSize)
        let tempRes = await Promise.all(list.map(async drugId => await downloadDrugBank3Dsdf(drugId)))
        // console.log(tempRes)
        res = res.concat(tempRes)

        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    // console.log(res)

    let headerSet = new Set()
    res.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
    headerSet = Array.from(headerSet).sort()
    // console.log(headerSet)
    

    const header = headerSet.join('\t')
    const rows = res.map(i => headerSet.map(ii => (
        i[ii]?.toString() || ''
    )).join('\t'))
    // console.log(rows.length)
    const toSave = [header].concat(rows).join('\n')

    fs.writeFile('./data/ligandsInfo.tsv', toSave, (error) => {console.log(error)})
}

const getAlphaFoldPDBLink = async (document) => document.querySelector(".entryDownloads > a")?.getAttribute('href')


const downloadAlphaFoldPDBs = async (rowsCur) => {
    puppeteer
    .use(StealthPlugin())
    .use(AdblockerPlugin({ blockTrackers: true }))
    .launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    .then(async browser => {
        const page = await browser.newPage()
        page.setDefaultNavigationTimeout(0)
        let summary = []
        for (let uniId of rowsCur) {
            if (uniId) {


                await page.goto(`https://alphafold.ebi.ac.uk/entry/${uniId}`)
                // await page.waitForSelector('#Structures', {timeout:0})
                await page.waitForTimeout(1000)
                const url = await page.$eval('body', getAlphaFoldPDBLink)

                let pdbSuccess = false
                let name = ""
                if (url) {
                    name = url.split('/').slice(-1)[0]
                    let res = await fetchAsync(url)
                    // console.log({res})
                    pdbSuccess = res.length > 0 && res !== 'error' && !res.includes('The specified key does not exist.')

                    if (pdbSuccess) {
                        fs.writeFile(`./data/targets/test/${name}`, res, (error)=>{console.log(error)})
                    }
                    // console.log({res}) 

                } else {
                    pdbSuccess = false
                }
                console.log(uniId, name)
                console.log({pdbSuccess})

                summary.push({
                    uniId,
                    name,
                    pdbSuccess
                })

            } else summary.push({})
        }
        

        await browser.close()

        let headerSet = new Set()
        summary.forEach(i => Object.keys(i).forEach(ii => headerSet.add(ii)))
        headerSet = Array.from(headerSet).sort()
        // console.log(headerSet)
        
        
        const header = headerSet.join('\t')
        const rows = summary.map(i => headerSet.map(ii => (
            i[ii]?.toString() || ''
            )).join('\t'))
        // console.log(rows.length)
        const toSave = [header].concat(rows).join('\n')
        
        fs.writeFile('./data/targetsInfo.tsv', toSave, (error) => {console.log(error)})
    })
}



// let articles = ""
// let articleList = articles.split(",")
// runDrugBankArticles(articleList)

// let entities = "BE0000030,BE0000147,BE0000211,BE0000215,BE0000264,BE0000270,BE0000393,BE0000393,BE0000394,BE0000428,BE0000428,BE0000428,BE0000457,BE0000457,BE0000635,BE0000704,BE0000704,BE0000838,BE0000854,BE0000854,BE0000854,BE0000854,BE0000877,BE0000918,BE0000918,BE0000918,BE0000922,BE0000944,BE0000956,BE0000961,BE0000979,BE0000981,BE0000982,BE0000984,BE0000984,BE0000985,BE0000985,BE0000985,BE0001046,BE0001047,BE0001047,BE0001051,BE0001051,BE0001060,BE0001062,BE0001062,BE0001096,BE0001097,BE0001097,BE0001114,BE0001164,BE0001172,BE0001172,BE0001180,BE0001283,BE0001283,BE0001283,BE0001353,BE0001353,BE0001646,BE0001646,BE0002204,BE0002401,BE0002401,BE0002408,BE0002408,BE0002409,BE0002409,BE0002442,BE0002442,BE0002442,BE0002683,BE0003309,BE0003309,BE0003418,BE0003428,BE0003428,BE0003433,BE0003449,BE0003450,BE0003461,BE0003462,BE0003462,BE0003481,BE0003493,BE0003493,BE0003517,BE0003517,BE0003517,BE0003546,BE0003546,BE0003546,BE0003546,BE0003546,BE0003546,BE0003640,BE0003722,BE0003768,BE0003772,BE0003772,BE0003790,BE0003790,BE0003790,BE0003997,BE0004145,BE0004145,BE0004506,BE0004506,BE0004578,BE0004583,BE0004741,BE0004807,BE0004903,BE0004903,BE0004903,BE0004903,BE0004907,BE0005055,BE0005076,BE0005551,BE0005803,BE0005813,BE0008643,BE0008643,BE0008684,BE0008694,BE0008716,BE0009000,BE0009048,BE0009143,BE0009272,BE0009324,BE0009345,BE0009415,BE0009550,BE0009668,BE0009698,BE0009698,BE0009859,BE0009865,BE0009900,BE0009903,BE0010032,BE0010032"
// entities = "BE0000985"
// let entityList = entities.split(",")
// runDrugBankEntities(entityList)

// let drugList = ""
// drugList = fs.readFileSync('ids.txt').toString()
// drugList = drugList.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// drugList = "DB05767"
// drugList = drugList.split(",")
// runDrugBankDrugs(drugList)

// let whats = ['transcriptomics', 'proteomics'] //proteomics / transcriptomics
// let change = 'increased' // decreased / increased
// let genes =  "TYK2,JAK1,JAK2,JAK3,FLT3,FLT4,PTGS2,MAPK2,MAPK1,PDIA3,FBN1,ADAMTSL4,BSG,XDH,TLR4,RELA,HMGCR,NLRP3,NOX2,CYBB,PRKAA1,PRKAA2,PRKAB1,PRKAB3,PRKAG1,PRKAG2,PRKAG3,NFKB2,NFKB1,AKT1,AKT2,AKT3,BMP2,BMP4,BMP6,TGFB1,TGFB3,IL1B,CHUK,IKBKB,IKBKG,ACVR1,BMPR1B,ALK2,ALK3,SMAD1,SMAD5,SMAD8,ACVR1,BMPR1A,PPARG,VDR,ABCC5,CBR1,GSTP1,PSENEN,APH1A,APH1B,NCSTN,PSEN1,CTNNB1,SLC39A13,SLC39A14"
// genes = genes.split(',')
// runDrugBankPharmaco(genes)


// let cids = "564,2141,5362485,443130,1054,53235510,5284616,,,10341154,,5318517,10288191,,,10297982,6918055,,,,62662,,5526,,8761,,,,,,,,3447,23978,23672064,24456,,,,,1014,4369359,447256,448436,6327350,2734054,6918537,,11253490,,,11450633,11243969,60823,205131,5494385,11840904,16122596,60206636,24768547,24752844,15953860,23645698,11538992,23661697,11554165,11495704,10450114,24832041,11710963,11572962,10024590,11840913,11840917,,11235729,10198228,16750059,5494422,,24798721,5459374,11974440,,16058650,11516136,134497,42608447,24180585,10320144,4747355,23647311,15991577,6914643,10096344,,,,938,3720,2812,2662,5957,261004,107758,,,,24798741,24798742,5280961,445154,5460341,,,,,,12041,,8515,6540289,16058637,6852206,9543521,25113171,2733526,1548887,448991,160355,97297,,,54675783,,2585,5281034,2244,46937095,9918381,11167602,11671467,4740,6253,6912404,6992140,,,5288266,11005,5284596,,,2895,17753880,,,,,440473,28417,,446320,84704,,,,2783,4887,3698,,,,,9871074,,,,,,107778,,134780,,5816,7028,,22524140,,13136,5573,4008,656668,15558638,456468,,5576,3291,5734,60663,941361,2520,2761,6476,644019,,,5833,2482,,3226,8280,2157,119171,4567,2162,3333,3784,4507,2351,6324659,6228,31260,446127,60594,5287974,444570,444569,,6914625,6914626,6914627,20843156,6914629,6914633,5288557,11963546,444567,5493444,4201,5362119,,,3652,2442,,,,5401,,23994,,,,5568,4199,3337,5362436,15942713,5276854,11954293,,47811,31101,28864,54746,6005,6540428,10531,2801,667468,1615,8969,2170,4184,8223,8226,,4830,27400,,43815,60795,60857,2913,11154555,5666,5287799,23648296,5287870,11840930,11840933,11840934,6420159,46937102,9547943,46937163,9887557,46937176,5467,5205,,,,49803313,667466,2726,9677,3821,3085218,216325,702,,31275,,,5757,5991,441298,446313,14985,5381226,6436173,447912,176870,6451164,36314,148124,5881,,2554,5342,,1775,392622,3292,4060,8271,4737,202225,449459,5743,3054,727,55245,8955,5564,10133,3198,4189,5353853,3823,2907,3397,3690,39042,2802,3339,54678486,192197,4764,40326,,638024,5280343,9818306,222757,,,13791,64929,,,9977819,236702,,24462,,,216326,9915886,,10257882,,,,3715,,,13342,452548,30323,,457193,3062316,446795,5287515,30819,867,,447522,,5287555,,12793,447523,,971,311,447518,5287544,4369496,,,,,,5287461,447536,5287463,,5287488,447532,5287550,75791,24905143,4708,,16040294,447534,,24905153,24905152,46937131,448171,5289215,10401956,5328969,5328940,,,643975,5162682,2094,4644,,1103,4055,,1046,,5566,,667490,2265,5288320,449035,,,38904,7697,6021,,,27661,,60961,134018,5284627,6083,4091,,,,,,,,,,,9458,637568,,,,,446156,,,,131704231,57525501,1662,439196,,,,64715,,,,,5494425,25126798,,,44205240,,,,,,,,,24963047,,,,,,,,9935073,,,,,61635,,216239,5329102,,,,3038522,,,9829523,68165256,,9911830,,,,,70788951,,,,92337,16741,,11175137,,10172943,,,6918562,,5310967,,,,5326727,44462678,16750106,10134160,766948,16129582,,,45270264,44224261,24801862,,,25203945,,,16122612,,10680,,,,,,,,,,9864881,16145453,,12082259,9888484,,,208901,,65981,,3478,65999,,,6443013,,24875301,,46937060,,,,,181137,11395145,,644213,,6006216,,23654841,2742752,,11460087,3672,10274777,39912,,,9826451,2787,,969516,5280934,,3121,2969,637517,,,,,,,,,8759,,,67678,,,22128,,,,,,,440995,,,,,10976469,6096886,16115004,,11493598,,4592,,,5164,,8064,7478,,,133021,,,5321765,802,,,,23640750,,12374,,129148,,,,221493,131505,46937097,2267,,,,,,,,3581192,10130120,,,46936357,,,,,,5360696,,,,"
// cids = fs.readFileSync('ids.txt').toString()
// cids = cids.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// console.log(cids.length)
// cids = "129631922"
// cids = cids.split(',')
// runPubchemMol(cids)

// entities = "BE0001283,,BE0003546,BE0000918,,,BE0009859,BE0000211,BE0005055,BE0000877,,BE0000854,,BE0000635,,BE0009698,BE0000428,BE0005813,,BE0000457,,BE0008643,,,BE0003428,,BE0003790,,BE0001062,,BE0000979,,BE0002409,,,BE0004741,,,,BE0001096,BE0002442,BE0001164,,BE0001047,BE0003418,,BE0000704,,BE0008716,,BE0003309,BE0000270,BE0010032,BE0000982,,,BE0001046,BE0000984,BE0009048,,BE0000393,,,,,,,,,,BE0001646,,,BE0001114,,BE0004506,BE0003462,BE0000956,BE0009143,BE0008684,,BE0003517,BE0009345,BE0001060,,,BE0001180,BE0003640,,BE0003517,BE0000838,,,BE0003461,BE0000457,,,BE0004907,BE0004903,BE0001172,BE0000428,,,BE0005803,BE0003546,BE0009550,,BE0000985,,BE0000985,,,,,,,,,BE0000918,BE0000961,BE0001051,BE0001047,,BE0009900,BE0009903,BE0003546,BE0005076,BE0004145,BE0002408,BE0003493,,BE0000147,BE0000264,BE0009272,BE0009415,BE0009324,BE0004903,,,BE0001051,BE0002442,BE0004903,BE0008694,,,BE0002204,BE0005551,BE0003546,,,BE0000984,BE0004506,BE0003481,BE0003546,,,BE0009000,BE0003546,,,BE0009865,BE0001097,BE0003790,BE0003772,,,,,BE0000985,BE0003722,,BE0002409,,BE0000854,BE0002401,,BE0003449,BE0000922,BE0008643,BE0001283,,BE0002401,BE0000215,BE0000854,BE0000393,BE0001646,BE0009698,BE0004807,BE0000030,,BE0003450,,,,,,,,,BE0001353,,,,,BE0000944,,BE0009668,BE0001097,BE0003790,BE0003772,BE0001062,,BE0004145,BE0002408,BE0003493,BE0003462,BE0003768,,BE0003997,BE0001353,,BE0000704,,BE0000981,,BE0000918,,,BE0001283,,,BE0004583,BE0002683,BE0004578,BE0010032,,BE0003433,,,,BE0002442,BE0003428,,,BE0000428,BE0001172,,,BE0004903,BE0000394,BE0003309,,BE0000854,,,BE0003517,BE0002204,BE0004907,BE0009554,BE0000428,BE0009550,BE0003546,BE0002442,BE0000574,BE0000984,BE0004506,BE0009900,BE0009903,BE0000264,BE0004903,BE0009272,BE0005551,BE0004145,BE0002408,BE0003493,BE0004146,BE0003410,BE0003409,BE0001051,BE0000147,BE0009415,BE0004655,BE0001154,BE0002394,BE0009000,BE0005076"
// // entities = "BE0004862,,BE0000147"
// entityList = entities.split(",")
// runDrugBankBEProteinsOnly(entityList)


// entities = ",,BE0004907,BE0004903,BE0001172,BE0000428,,,BE0005803,BE0003546,BE0009550,,BE0000985,,BE0000985,,,,,,,,,BE0000918,BE0000961,BE0001051,BE0001047,,BE0009900,BE0009903,BE0003546,BE0005076,BE0004145,BE0002408,BE0003493,,BE0000147,BE0000264,BE0009272,BE0009415,BE0009324,BE0004903,,,BE0001051,BE0002442,BE0004903,BE0008694,,,BE0002204,BE0005551,BE0003546,,,BE0000984,BE0004506,BE0003481,BE0003546,,,BE0009000,BE0003546,,,BE0009865,BE0001097,BE0003790,BE0003772,,,,,BE0000985,BE0003722,,BE0002409,,BE0000854,BE0002401,,BE0003449,BE0000922,BE0008643,BE0001283,,BE0002401,BE0000215,BE0000854,BE0000393,BE0001646,BE0009698,BE0004807,BE0000030,,BE0003450,,,,,,,,,BE0001353,,,,,BE0000944,,BE0009668,BE0001097,BE0003790,BE0003772,BE0001062,,BE0004145,BE0002408,BE0003493,BE0003462,BE0003768,,BE0003997,BE0001353,,BE0000704,,BE0000981,,BE0000918,,,BE0001283,,,BE0004583,BE0002683,BE0004578,BE0010032,,BE0003433,,,,BE0002442,BE0003428,,,BE0000428,BE0001172,,,BE0004903,BE0000394,BE0003309,,BE0000854,,,BE0003517"
// // entities = "BE0004862,,BE0000147"
// entityList = entities.split(",")
// entityList = [...new Set(entityList)]
// runDrugBankProteinsForBE(entityList)

// let proteins = "P18848,P04839,P19838,P04114,P04839"
// let proteinList = proteins.split(",")
// runDrugBankProteins(proteinList)


// entities = ",,BE0004907,BE0004903,BE0001172,BE0000428,,,BE0005803,BE0003546,BE0009550,,BE0000985,,BE0000985,,,,,,,,,BE0000918,BE0000961,BE0001051,BE0001047,,BE0009900,BE0009903,BE0003546,BE0005076,BE0004145,BE0002408,BE0003493,,BE0000147,BE0000264,BE0009272,BE0009415,BE0009324,BE0004903,,,BE0001051,BE0002442,BE0004903,BE0008694,,,BE0002204,BE0005551,BE0003546,,,BE0000984,BE0004506,BE0003481,BE0003546,,,BE0009000,BE0003546,,,BE0009865,BE0001097,BE0003790,BE0003772,,,,,BE0000985,BE0003722,,BE0002409,,BE0000854,BE0002401,,BE0003449,BE0000922,BE0008643,BE0001283,,BE0002401,BE0000215,BE0000854,BE0000393,BE0001646,BE0009698,BE0004807,BE0000030,,BE0003450,,,,,,,,,BE0001353,,,,,BE0000944,,BE0009668,BE0001097,BE0003790,BE0003772,BE0001062,,BE0004145,BE0002408,BE0003493,BE0003462,BE0003768,,BE0003997,BE0001353,,BE0000704,,BE0000981,,BE0000918,,,BE0001283,,,BE0004583,BE0002683,BE0004578,BE0010032,,BE0003433,,,,BE0002442,BE0003428,,,BE0000428,BE0001172,,,BE0004903,BE0000394,BE0003309,,BE0000854,,,BE0003517"
// // entities = ",BE0000147"
// entityList = entities.split(",")
// entityList = [...new Set(entityList)]
// runDrugBankDrugsForBEandProteins(entityList)

// proteins = "P18848,P04839,P19838,P04114,P04839"
// proteins = "P04839"
// proteinList = proteins.split(",")
// proteinList = [...new Set(proteinList)]
// runDrugBankDrugsForProteins(proteinList)

// drugList = fs.readFileSync('DBdownloadMols.tsv').toString()
// drugList = drugList.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// downloadDrugBankMols(drugList)

// cids = fs.readFileSync('PubChemdownloadMols.tsv').toString()
// cids = cids.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// downloadPubchemMols(cids)
// console.log(cids)

// cids = fs.readFileSync('PubChemdownloadMols.tsv').toString()
// cids = cids.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// downloadPubchemMolsFromPage(cids)
// console.log(cids)

// let zincIds = fs.readFileSync('ZincDownloadMols.tsv').toString()
// zincIds = zincIds.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// downloadZincMols(zincIds)
// console.log(cids)

// drugList = fs.readFileSync('DBdownloadMols.tsv').toString()
// drugList = drugList.split('\n').slice(0,-1).map(i => i.replace('\r',''))
// downloadDrugBank3Dsdfs(drugList)

let uniIds = "P35354,Q04771,P35555,P21695,Q13131"
uniIds = uniIds.split(',')
// uniIds = uniIds.slice(0,2)
downloadAlphaFoldPDBs(uniIds)
