
from dask.distributed import Client, LocalCluster, as_completed

cores = {
    'c6g.medium' : 1,
    'c6g.large' : 2,
    'c6g.xlarge' : 4,
    'c6g.2xlarge' : 8,
    'c6g.4xlarge' : 16,
    'c6g.8xlarge' : 32,
    'c6g.12xlarge' : 48,
    'c6g.16xlarge' : 64,
    'c5.large' : 1,
    'c5.xlarge' : 2,
    'c5.2xlarge' : 4,
    'c5.4xlarge' : 8,
    'c5.9xlarge' : 18,
    'c5.12xlarge' : 24,
    'c5.18xlarge' : 36,
    'c5.24xlarge' : 48
}

cluster_pool=[]
chunks_todo=[]
chunks_done=[]
results_gathered=0
chunks_progress=[]
start=0
chunk_size=512
errors=0
already_done=0
errors_aws=0
current=0
total=0
restart_tasks=0
current_cost=0
isStart=False


def func_docking(ligand):
    try:
        docking = DockingInterface()
        docking.set_handler(variables['handler'])
        docking.set_config(variables['handler_config'])
        docking.set_receptor(variables['receptor'])
        if ligand.find(".tar") + ligand.find(".zip") + \
        ligand.find(".gz") + ligand.find(".bz2") == -4:
            docking.set_ligand(ligand)
        else:
            docking.set_buffer_ligand(get_buffer(ligand))
        docking.docking()
        res = docking.get_result()
        return res, ligand
    except Exception as e:
        return e, ligand

    
def rename_file(file):
    files = os.listdir(file.rsplit('/',1)[0])
    files = list(filter(re.compile(r'{}*.[0-9]+'.format(file.rsplit('/',1)[1])).match, files))
    last = 0
    for f in files:
        if f.rsplit('.', 1)[-1].isdigit() and int(f.rsplit('.', 1)[-1]) > last:
            last = int(f.rsplit('.', 1)[-1])
    if Path(file).exists():
        Path(file).rename("{}.{}".format(file, last+1))

        
def getNameisExist(file):
    if Path(file).exists():
        files = os.listdir(file.rsplit('/',1)[0])
        files = list(filter(re.compile(r'{}*.[0-9]+'.format(file.rsplit('/',1)[1])).match, files))
        last = 0
        for f in files:
            if f.rsplit('.', 1)[-1].isdigit() and int(f.rsplit('.', 1)[-1]) > last:
                last = int(f.rsplit('.', 1)[-1])
        return "{}.{}".format(file, last+1)
    return file
    
    
def sort_by_affinity(ligand, res):
    path_ligand = ligand
    if ligand.endswith(".gz"):
        path_ligand = ligand.split(".gz")[0]
    elif ligand.endswith(".bz2"):
        path_ligand = ligand.split(".bz2")[0]
    is_written = False
    affinity = res.get_values_by_index(0)[1]
    csv = open(variables['csv_out'], "a")
    for gap in variables['ranges_for_affinity']:
        if affinity <= gap[1] and affinity >= gap[0]:
            is_written = True
            file = "{}/{}".format(gap[-1], path_ligand.rsplit("/", 1)[1])
            file = getNameisExist(file)
            f = open(file, "a")
            for n in range(res.get_number_of_models()):
                model = res.get_model_by_index(n)
                f.write(f"{model}\n")
            f.close()
            csv.write("{},{},{}/{}\n".format(ligand, affinity, gap[-1], file.rsplit("/", 1)[1]))
            
    if 'output_folder' in variables and not is_written:
        file = "{}/{}".format(variables['output_folder'], path_ligand.rsplit("/", 1)[1])
        file = getNameisExist(file)
        f = open(file, "a")
        for n in range(res.get_number_of_models()):
            model = res.get_model_by_index(n)
            f.write(f"{model}\n")
        f.close()
        csv.write("{},{},{}/{}\n".format(ligand, affinity, variables['output_folder'], file.rsplit("/", 1)[1]))
    csv.close()

    
def get_buffer(filename):
    
    def get_bzip2_buffer(bzipname):
        bzipfile = bz2.open(bzipname)
        return bzipfile.read().decode('ascii')
    
    def get_gzip_buffer(gzipname):
        gzfile = gzip.open(gzipname)
        return gzfile.read().decode('ascii')
    
    def get_tar_buffer(tarname, filename):
        archive = tarfile.open(tarname)
        if len(filename.split(":/")) > 2:
            for arcname in filename.split(":/")[1:-1]:
                obj = archive.extractfile(arcname)
                archive = tarfile.open(fileobj=obj)
        return archive.extractfile(filename.split(":/")[-1]).read().decode('ascii')
    
    def get_zip_buffer(zipname, filename):
        file = open(zipname, "rb")
        zf = zipfile.ZipFile(io.BytesIO(file.read()), "r")
        if len(filename.split(":/")) > 2:
            for arcname in filename.split(":/")[1:-1]:
                zipobj = zf.read(arcname)
            zf = zipfile.ZipFile(io.BytesIO(zipobj))
        return zf.read(filename.split(":/")[-1]).decode('ascii')

    if filename.find(".tar.bz2") + filename.find(".tar.gz") != -2:
        return get_tar_buffer(filename.split(":/")[0], filename)
    elif filename.find(".gz") != -1:
        return get_gzip_buffer(filename)
    elif filename.find(".bz2") != -1:
        return get_bzip2_buffer(filename)
    elif filename.find(".zip") != -1:
        return get_zip_buffer(filename.split(":/")[0], filename)

    
def unpack_tar(name=None, fileobject=None):
    with tarfile.open(name, fileobj=fileobject) as archive:
        arr_lig = []
        for member in archive:
            if member.name.endswith('.tar.gz') or member.name.endswith('.tar.bz2'):
                obj = archive.extractfile(member)
                arr_lig += unpack_tar(member.name, fileobject=obj)
            
            if member.isreg() and member.name.endswith(".pdbqt"):
                arr_lig.append(member.name)
        return ["{}:/{}".format(name, lig) for lig in arr_lig]

    
def unpack_zip(zipname=None, zipobj=None):
    arr_lig = []
    if not zipobj:
        file = open(zipname, "rb")
        zf = zipfile.ZipFile(io.BytesIO(file.read()), "r")
    else:
        zf = zipfile.ZipFile(io.BytesIO(zipobj))
        
    for fileinfo in zf.infolist():
        if fileinfo.filename.endswith(".zip"):
            arr_lig += unpack_zip(fileinfo.filename, zipobj=zf.read(fileinfo))
        
        if fileinfo.filename.endswith(".pdbqt"):
            arr_lig.append(fileinfo.filename)
    return ["{}:/{}".format(zipname, lig) for lig in arr_lig]
        
    
def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

        
async def metacluster():
    while True:
        # Task Pool
        tasks=[]
        for cluster in cluster_pool:
            if cluster.status is "running" and cluster.client.status is "closed":
                # we have failed guy
                cluster.status="failed"
                cluster.failn=cluster.failn+1

        # Checking if we need to bring something up or down
        for cluster in cluster_pool:
            if cluster.status is None:
                print("Cluster "+cluster.name+" is not running. Scheduling for start.")
                tasks.append(cluster.connect())
            elif cluster.status is "failed" and cluster.failn <= 2:
                print("Cluster "+cluster.name+" is marked as failed Restarting")
                tasks.append(cluster.connect())
            elif cluster.status is "failed" and cluster.failn > 2:
                print("Cluster"+cluster.name+" failed more than two times. Marking as dead")
                cluster.status="dead"
            elif cluster.status is "shutdown":
                print("Cluster"+cluster.name+" marked for shutdown. Scheduling for graceful stop")
                tasks.append(cluster.shutdown())
        await asyncio.gather(*tasks)
        await asyncio.sleep(2)
    print("cluster_pool routine has exited")
    return(True)


async def scheduler():
    global chunks_done
    global chunks_progress
    global chunks_todo
    while True:
        if chunks_todo:
            if not variables['local']:
                # getting list of clusters with less than chunk_size*2 tasks
                free_cluster_list=[]
                for cluster in cluster_pool:
                    if cluster.status is "running":
                        if await cluster.get_tasks_count() < chunk_size:
                            free_cluster_list.append(cluster)
            else:
                free_cluster_list = cluster_pool
                        
            # submitting chunks to clusters
            for cluster in free_cluster_list:
                if chunks_todo:
                    chunk = chunks_todo.pop()
                    chunks_progress.append({
                        'client' : cluster.client,
                        'futures' : cluster.client.map(func_docking,chunk)
                    })
                else:
                    #print("No more chunks in todo list")
                    break
        #getting chunks in progress status
        if chunks_progress:
                chunk_finished = False
                chunks_tmp=[]
                for chunk in chunks_progress:
                    chunk_finished = True
                    # need to check if all elements are done
                    for elem in chunk['futures']:
                        if elem.status == 'pending':
                            chunk_finished = False
                    if chunk_finished:
                        chunks_done.append(chunk)
                    else:
                        chunks_tmp.append(chunk)
                chunks_progress=chunks_tmp

        await asyncio.sleep(5)
    print("scheduler routine has exited")

    
async def results_handler():
    global results_gathered
    global chunks_done
    global errors
    global errors_aws
    global current
    global errors_aws
    global already_done
    global restart_tasks
    while True:         
        if not variables['server_mode'] and current == total and len(chunks_done) == 0 \
        and len(chunks_progress) == 0 :
            if errors_aws != 0:
                print("AWS errors restart")
                restart_list = []
                files = get_pdbqt_from_folder(variables['input_path'])
                archives = get_archives_from_folder(variables['input_path'])
                for arcname in archives:
                    if arcname.endswith(".tar.bz2") or arcname.endswith(".tar.gz"):
                        files += unpack_tar(arcname)
                    elif arcname.endswith(".zip"):
                        files += unpack_zip(arcname)
                    elif arcname.endswith(".gz"):
                        files.append(arcname)
                    elif arcname.endswith(".bz2"):
                        files.append(arcname)
                done = []
               
                if Path(variables['csv_out']).is_file():
                    f = open(variables['csv_out'], "r")
                    for row in f:
                        done.append(row.split(',')[0])
                    f.close()
                if Path(variables['failed_ligand_out']).is_file():
                    f = open(variables['failed_ligand_out'], "r")
                    for row in f:
                        done.append(row.split('\n')[0])
                    f.close()

                tmp_files = sorted(files)
                done.sort()
                ind, ind_done = 0, 0
                while ind_done != len(done) and ind != len(tmp_files):
                    if done[ind_done] == tmp_files[ind]:
                        ind += 1 
                        ind_done += 1
                    else:
                        restart_list.append(tmp_files[ind])
                        ind += 1
                restart_list += tmp_files[ind:]
                restart_tasks += len(restart_list)
                errors_aws = 0
                for i in list(chunks(restart_list,chunk_size)):
                    chunks_todo.append(i)

            else:
                if not variables['local']:
                    tasks=[]
                    for cluster in cluster_pool:
                        tasks.append(cluster.shutdown())
                    await asyncio.gather(*tasks)
                    os._exit(0)
                else:
                    cluster_pool[0].close()
                    raise SystemExit
                
        tmp=0
        for chunk in chunks_done:
            ok_chunks=[]
            for elem in chunk['futures']:
                if elem.status == 'finished':
                    ok_chunks.append(elem)
                elif elem.status != 'pending' and elem.status != 'finished':
                    errors_aws += 1
                    if 'errors_aws' in variables:
                        f = open(variables['errors_aws'], "a")
                        exc = await elem.exception()
                        trc = await elem.traceback()
                        f.write(f"{elem}, {exc}, {trc}\n")
                        f.close()
                        
                    if variables['debug']:    
                        w_logs = await chunk['client'].get_worker_logs(100, nanny=True)
                        s_logs = await chunk['client'].get_scheduler_logs(n=100)
                        f = open("er_worker_logs", "a")
                        f.write(f"{w_logs}\nend\n")
                        f.close()

                        f = open("er_scheduler_logs", "a")
                        f.write(f"{s_logs}\nend\n")
                        f.close()
                    
            chunk_results=[]
            if len(ok_chunks):
                if not variables['local']:
                    chunk_results = await chunk['client'].gather(ok_chunks)
                else:
                    chunk_results = chunk['client'].gather(ok_chunks)

            for result in chunk_results:
                if isinstance(result[0], Exception):
                    errors += 1
                    if 'failed_ligand_out' in variables:   
                        f = open(variables['failed_ligand_out'], "a")
                        f.write(f"{result[1]}\n")
                        f.close()
                    if 'error_msg_out' in variables:   
                        f = open(variables['error_msg_out'], "a")
                        f.write(f"{result[0]}\n")
                        f.close()
                
                elif result[0].get_number_of_models() > 0:
                    if 'ranges_for_affinity' in variables:
                        sort_by_affinity(result[1], result[0])
                    elif 'output_folder' in variables:
                        ligand = result[1]
                        if ligand.endswith(".gz"):
                            ligand = ligand.split(".gz")[0]
                        elif ligand.endswith(".bz2"):
                            ligand = ligand.split(".bz2")[0]
                        file = "{}/{}".format(variables['output_folder'], ligand.rsplit("/", 1)[1])
                        file = getNameisExist(file)
                        csv = open(variables['csv_out'], "a")
                        csv.write("{},{},{}\n".format(result[1], result[0].get_values_by_index(0)[1], file))
                        csv.close()
                        
                        f = open(file, "w")
                        for n in range(result[0].get_number_of_models()):
                            model = result[0].get_model_by_index(n)
                            f.write(f"{model}\n")
                        f.close()
                            
            tmp += len(chunk['futures'])
            chunk['futures'].clear()
        chunks_done.clear()
        results_gathered += tmp
        
        await asyncio.sleep(1)

        
async def monitor():
    global chunks_done
    global chunks_progress
    global chunks_todo
    global start
    global results_gathered
    global total
    global errors
    global errors_aws
    global already_done
    global current
    global restart_tasks
    global current_cost
    global isStart
    while True:
        num_clusters=0
        num_workers=0
        num_cpus=0
        if not variables['local']:
            for cluster in cluster_pool:
                if cluster.status=="running":
                    num_clusters=num_clusters+1
                    num_workers=num_workers+cluster.get_number_of_workers()
                    num_cpus=num_workers*cores[cluster.worker_instance_type]
        partially_completed=0
        if chunks_progress:
            for chunk in chunks_progress:
                for elem in chunk['futures']:
                    if elem.status == 'finished':
                        partially_completed = partially_completed+1
        elapsed = round(time.time()) - start
        current = already_done - restart_tasks
        for chunk in chunks_done:
            current = current + len(chunk['futures'])
        current = current + partially_completed + results_gathered
        time_left, lig_per_sec, eta_cost = 0, 0, 0
        if current-already_done:
            if not isStart:
                first_done = round(time.time()) - start - 1
                isStart = True
            time_left = (elapsed-first_done)*(total-(current-already_done))/((current-already_done)*60)
            lig_per_sec = (current-already_done)/(elapsed-first_done)
        if not variables['local']:
            if 'cost_per_cpu' in variables:
                current_cost += (variables['cost_per_cpu'] + variables['cost_per_cpu']*num_cpus)/3600
                if lig_per_sec:
                    eta_cost = current_cost + (total-current)/lig_per_sec * (variables['cost_per_cpu'] + variables['cost_per_cpu']*num_cpus)/3600
                print('%d/%d/%d/%d clusters: %d, workers: %d, CPUs: %d, Elapsed: %d min %02d s, Left: %d min, Rate: %.2f lig/sec, Current cost: $%.2f, Cost estimate: $%.2f' % (current,errors,errors_aws,total,num_clusters,num_workers,num_cpus,elapsed//60,elapsed%60,time_left, lig_per_sec, current_cost, eta_cost))
            else:
                print('%d/%d/%d/%d clusters: %d, workers: %d, CPUs: %d, Elapsed: %d min %d s, Left: %d min, Rate: %.2f lig/sec' % (current,errors,errors_aws,total,num_clusters,num_workers,num_cpus,elapsed//60,elapsed%60,time_left, lig_per_sec))
        else:
            print('%d/%d/%d/%d, Elapsed: %d min %d s, Left: %d min, Rate: %.2f lig/sec' % (current, errors, errors_aws, total, elapsed//60, elapsed%60, time_left, lig_per_sec))
        await asyncio.sleep(1)
    print("Monitor has exited")

    
async def socket():
    while True:
        await asyncio.sleep(5)
    print("Socket has exited")

    
def get_pdbqt_from_folder(path):
    return(list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.pdbqt")))))


def get_archives_from_folder(path):
    zip_arc = list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.zip"))))
    tar_bz_arc = list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.tar.bz2"))))
    tar_gz_arc = list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.tar.gz"))))
    gzip_arc = list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.gz"))))
    bzip2_arc = list(map(lambda x: str(x.absolute()), list(Path(path).rglob("*.bz2"))))
    return zip_arc + tar_bz_arc + tar_gz_arc + gzip_arc + bzip2_arc


async def graceful_shutdown(signame,loop):
    global cluster_pool
    print("Got signal:"+str(signame))
    if not variables['local']:
        tasks = []
        for cluster in cluster_pool:
            tasks.append(cluster.shutdown())
        await asyncio.gather(*tasks)
        os._exit(0)
    else:
        cluster_pool[0].close()
        raise SystemExit


async def rerun_on_exception(coro):
    global tasks
    global cluster_pool
    global chunks_todo
    global chunks_done
    global results_gathered
    global already_done
    global chunks_progress
    global isStart
    global restart_tasks

    while True:
        try:
            await coro()
        except SystemExit:
            break
        except Exception as e:
            print("Exception in rerun_on_exc: {}".format(repr(e)))
            tasks=[]
            variables['restart'] = True
            cluster_pool=[]
            chunks_todo=[]
            chunks_done=[]
            results_gathered=0
            already_done=0
            chunks_progress=[]
            isStart=False
            restart_tasks = 0
            for conf in [cluster_conf]:
                cluster_pool.append(docking_cluster(conf))

    
async def main():
    global start
    global chunks_todo
    global total
    global errors
    global already_done
   
    
    loop = asyncio.get_event_loop()
    signals = (signal.SIGHUP, signal.SIGTERM, signal.SIGINT)
    for s in signals:
        loop.add_signal_handler(
            s, lambda s=s: asyncio.create_task(graceful_shutdown(s, loop)))


    chunks_todo = []
    filenames = get_pdbqt_from_folder(variables['input_path'])
    archives = get_archives_from_folder(variables['input_path'])
    for arcname in archives:
        if arcname.endswith(".tar.bz2") or arcname.endswith(".tar.gz"):
            filenames += unpack_tar(arcname)
        elif arcname.endswith(".zip"):
            filenames += unpack_zip(arcname)
        elif arcname.endswith(".gz"):
            filenames.append(arcname)
        elif arcname.endswith(".bz2"):
            filenames.append(arcname)
    total = len(filenames)
    if not total:
        print("Ligands not found, end of program")
        sys.exit(0)

    if variables['restart'] and Path(variables['csv_out']).is_file():
        done = []
        f = open(variables['csv_out'], "r")
        for row in f:
            tmp = row.split(',')
            done.append(tmp[0])
        f.close()

        already_good_done = len(done)
        if Path(variables['failed_ligand_out']).is_file():
            f = open(variables['failed_ligand_out'], "r")
            for row in f:
                done.append(row.split('\n')[0])
            f.close()
        errors = len(done) - already_good_done
        already_done = len(done)
        tmp_files = sorted(filenames)

        filenames.clear()
        done.sort()
        ind, ind_done = 0, 0
        while ind_done != len(done) and ind != len(tmp_files):
            if done[ind_done] == tmp_files[ind]:
                ind += 1 
                ind_done += 1
            else:
                filenames.append(tmp_files[ind])
                ind += 1
        filenames += tmp_files[ind:]

    if len(filenames) == 0:
        print("All task have been completed, end of program")
        sys.exit(0)

    for i in list(chunks(filenames,chunk_size)):
        chunks_todo.append(i)
    print("All chunks in todo list: "+str(len(chunks_todo)))
            
    start = round(time.time())
    
    if not variables['local']:
        tasks = [asyncio.ensure_future(metacluster()), asyncio.ensure_future(scheduler()), asyncio.ensure_future(monitor()), asyncio.ensure_future(results_handler())]
        try:
            await asyncio.gather(*tasks)
        except Exception:
            for t in tasks:
                t.cancel()
            raise
    else:
        tasks = [scheduler(), monitor(), results_handler()]
        await asyncio.gather(*tasks)
        

if __name__ == "__main__":
    variables = dict()
    variables['server_mode'] = False
    variables['restart'] = False
    variables['debug'] = False

    parser = ArgumentParser()
    parser.add_argument("--config", type=str, help="Main config file (.yml)")
    parser.add_argument("--handler", type=str, help="Name of handler (usually smina)")
    parser.add_argument("--handler_config", type=str, help="Path to config file for handler (.txt)")
    parser.add_argument("--input_path", type=str, help="Path to folder with ligands (.pdbqt, subdirectories are searched automatically)")
    parser.add_argument("--receptor", type=str, help="Path to receptor (.pdbqt)")
    parser.add_argument("--output_folder", type=str, help="Path to output folder for docked .pdbqt")
    parser.add_argument("--csv_out", type=str, help="Path to output .csv file")
    parser.add_argument("--output", type=str, help="Path to output folder with .csv, ligands, errors, and etc.")
    parser.add_argument("--address", type=str, help="Dask cluster address")
    parser.add_argument("--maximum_scale", type=str, help="Dask cluster maximum scale")
    parser.add_argument("--name", type=str, help="Dask cluster name")
    parser.add_argument("--partition", type=str, help="Partition for Dask cluster")
    parser.add_argument("--worker_instance_type", type=str, help="Type of worker instance for Dask cluster")
    parser.add_argument("--scheduler_instance_type", type=str, help="Type of scheduler instance for Dask cluster")
    parser.add_argument("--server_mode", type=bool, help="Keep running after all ligands have been processed")
    parser.add_argument("--failed_ligand_out", type=str, help="Output file containing failed ligand filenames (.csv)")
    parser.add_argument("--error_msg_out", type=str, help="Output file containing error messages that come from docking engine (.txt)")
    parser.add_argument("--errors_aws", type=str, help="Output file containing error messages that come from AWS (.txt)")
    parser.add_argument("--restart", type=bool, help="Run leftover unprocessed files")
    parser.add_argument("--cost_per_cpu", type=float, help="Cost per AWS CPU")
    parser.add_argument("--debug", type=bool, help="Write debug files (for development only)")
    parser.add_argument("--local", type=bool, default=False, help="Run dockingfactory in local mode")
    args = vars(parser.parse_args())
    
    with open(args['config'], 'r') as stream:
        try:
            cfg = yaml.safe_load(stream)
        except yaml.YAMLError as exc:
            print(exc)

    for var in cfg:
        variables[var] = cfg[var]
    for var in args:
        if args[var] != None:
            variables[var] = args[var]
            
    cur_path = str(Path().resolve())
    for var in ['handler_config', 'input_path', 'receptor', 'output_folder', 'csv_out', 'failed_ligand_out', \
                'error_msg_out', 'errors_aws', 'output']:
        if var in variables and not variables[var].startswith('/'):
            variables[var] = "{}/{}".format(cur_path, variables[var])
    if 'ranges_for_affinity' in variables:
        for gap in variables['ranges_for_affinity']:
            if not gap[-1].startswith('/'):
                gap[-1] = "{}/{}".format(cur_path, gap[-1])      

    if [i for i in ['csv_out', 'failed_ligand_out', 'error_msg_out', 'output_folder'] if i in variables]:
        print("Options [csv_out, failed_ligand_out, error_msg_out, output_folder] are deprecated, please use 'output'")

    if 'output' in variables:
        if variables['output'].endswith('/'):
            variables['output'] = variables['output'].rsplit('/', 1)[0]
        if [i for i in ['csv_out', 'failed_ligand_out', 'error_msg_out', 'output_folder'] if i in variables]:
            raise Exception("Incorrect config: use either 'output' or ['csv_out', 'failed_ligand_out', 'error_msg_out', 'output_folder']")
        if not variables['restart']:
            if not Path(variables['output']).exists() or len(os.listdir(variables['output'])) > 1 or \
                    (len(os.listdir(variables['output'])) == 1 and os.listdir(f"{variables['output']}/{os.listdir(variables['output'])[0]}")):
                rename_file(variables['output'])

            variables['csv_out'] = "{}/{}".format(variables['output'], "successful_ligands.csv")
            variables['failed_ligand_out'] = "{}/{}".format(variables['output'], "failed_ligand.csv")
            variables['error_msg_out'] = "{}/{}".format(variables['output'], "error_msg_out.txt")
            variables['output_folder'] = "{}/{}".format(variables['output'], "processed_ligands")
            Path(variables['output_folder']).mkdir(parents=True, exist_ok=True)

    
    with open(variables['handler_config']) as f:
        cfg_var = []
        for line in f.readlines():
            cfg_var.append(line.split('=')[0].strip())
        for var in cfg_var:
            if var == "receptor" or var == "ligand":
                raise Exception("ligands and receptor are specified in the config.yml, not the handler")
    
    if not variables['local']:
        chunk_size=cores[variables['worker_instance_type']]*variables['maximum_scale']*2
        if chunk_size < 128:
            chunk_size=128

        cluster_conf = dict()
        for conf in ['address', 'maximum_scale', 'name', 'partition', 'worker_instance_type','scheduler_instance_type']:
            if variables[conf] != None:
                cluster_conf[conf] = variables[conf]
        for conf in [cluster_conf]:
            cluster_pool.append(docking_cluster(conf))
    else:
        chunk_size=1
        
        cluster = LocalCluster()
        cluster.client = Client(cluster)
        
        cluster_pool.append(cluster)
    
    if not variables['restart']:
        if 'output_folder' in variables and not 'output' in variables:
            if variables['output_folder'].endswith('/'):
                variables['output_folder'] = variables['output_folder'].rsplit('/', 1)[0]
            if not Path(variables['output_folder']).exists() or os.listdir(variables['output_folder']):
                rename_file(variables['output_folder'])
                Path(variables['output_folder']).mkdir(parents=True, exist_ok=True)

        if 'ranges_for_affinity' in variables:
            for gap in variables['ranges_for_affinity']:
                if not Path(gap[-1]).exists() or os.listdir(gap[-1]):
                    rename_file(gap[-1])
                    Path(gap[-1]).mkdir(parents=True, exist_ok=True)

        rename_file(variables['csv_out'])
        rename_file(variables['failed_ligand_out'])
        rename_file(variables['error_msg_out'])

    if not variables['local']:
        asyncio.run(rerun_on_exception(main))
    else:
        asyncio.run(main())
[dmitriy.pustoshilov@compute-dy-c5large-10 ~]$ 
