WORK_DIR="/home/scip/dmitriy.pustoshilov/runSmina/forSmina"
TEST_DIR="/home/scip/dmitriy.pustoshilov/runSmina/forSmina/10/22tar"
TEST_DIR2="/home/scip/dmitriy.pustoshilov/runSmina/forSmina/13/3tar"
JOBBER="/home/scip/dmitriy.pustoshilov/runSmina/dockingfactory_job.sh"

source /shared/bundle/dask/bin/activate

for group in $WORK_DIR/* ; do
  for target in $group/* ; do
    echo $group $target
    dockingfactory.py \
    --config $target/config.yml \
    --address http://10.11.14.188:8000 \
    --restart True \
    --local True \
    --name docking2 \
    --partition compute-cpu \
    --worker_instance_type c5.9xlarge \
    --scheduler_instance_type c5.large

  done
done

# cd $TEST_DIR
# dockingfactory.py \
#     --config $TEST_DIR/config.yml \
#     --address http://10.11.14.188:8000 \
#     --restart True \
#     --local True \
#     --name docking2 \
#     --partition compute-cpu \
#     --worker_instance_type c5.9xlarge \
#     --scheduler_instance_type c5.large
    
#     # sbatch --output ./logs/$group"_"$target"factory.log" $JOBBER --config $target/config.yml
# sbatch -n 1 -N 1 --output ./logs/1factory.log $JOBBER --config $TEST_DIR/config.yml
