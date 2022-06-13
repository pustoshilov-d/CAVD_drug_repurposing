import re
from pkg_resources import to_filename
import requests
import xml.etree.ElementTree as ET

# query = "Osteogenic differentiation of valve interstitial cells".replace(" ", "+")
# response = requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="+query+"&retmax=200&usehistory=y")
# # print(response.text)
# root = ET.fromstring(response.text)
# print(root)
# list = []
# for child in root[5]:
#   list.append(child.text)
#   # print(child.text)
# print(len(list))
  
# query = ",".join(list)
# print(query)

query= "35571096,35433352,35417712,35409134,35397552,35367413,35331838,35318164,35299058,35289986,35282345,35238312,35190902,35109802,35074856,34914964,34254733,34895136,34766179,34745206,34740021,34527708,34352088,34243610,34229104,34204737,34043161,33938898,33920891,33744308,33579497,33482604,33184978,33070258,32259211,31924353,31761339,33251046,33173427,32982764,32938214,32774703,32733235,32679147,32587322,32369647,32247641,32247641,32189385,32169720,32168892,32066043,32043019,31945413,31893948,31852220,31301902,31140727,31861929,31582988,31506459,31437530,31136747,31047003,31041314,31034990,30901896,33405617,30846207,30796046,30746757,30579537,30464116,30246479,30524301,30371255,30053524,30026273,29679571,29308559,29227539,29016735,28488393,29148548,28821833,28607103,28522163,28438736,28362018,28283241,28179397,28111052,28024939,27761653,26631842,28220141,27815266,27376093,27304080,26996755,26947381,26515875,26232165,25957738,25806689,25722432,25594437,25531888,25528991,25132377,24148916,23606251,23499458,22176709,21863660,21617139,21164078,21163264,21131478,19695258,19304575,19218344,17846318,16820639,16820635,16359063"

# response = requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id="+query)
# print(response.text)
# root = ET.fromstring(response.text)
# print(root)
# list = []
# with open('articles.tsv','w', encoding="utf8") as doc:
#   for child in root:
#     # print(child.tag, child.attrib)
#     print(child[1].text+';;'+child[6].text+';;'+child[18].text+';;'+child[0].text)
#     # doc.write(child[1].text+'\t'+child[6].text+'\t'+child[18].text+'\t'+child[0].text)  
#   doc.close()



from pattern3 import web
import requests


with open('articles.tsv','w', encoding="utf8") as doc:
  for id in query.split(','):
    url = "http://www.ncbi.nlm.nih.gov/pubmed/{0}".format(id)
    page = requests.get(url).text.encode('utf-8', 'ignore')
    dom = web.Element(page)
    # print(dom)
    abstr = dom.by_id("enc-abstract").by_tag("p")[0].content.replace("\\n", "").replace("\n", "")
    abstr = str(id) + "\t" +re.sub('\<.*\>', '', abstr).strip()
    abstr = abstr+'\n'
    print(abstr)
    doc.write(abstr)
    # print(dom.by_tag("abstracttext")[0].content)

  doc.close()

