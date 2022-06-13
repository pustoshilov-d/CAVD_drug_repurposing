echo "1"

# TARGET_SCRIPT="C:/Bioinformatics/ADFRsuite/bin/prepare_receptor.bat"
# LIGAND_SCRIPT="C:/Bioinformatics/ADFRsuite/bin/prepare_ligand.bat"
# WORK_DIR="C:/Projects/PSFM_diploma/Searching"
# $TARGET_SCRIPT -h
# $LIGAND_SCRIPT -h

# PREPARE_SCRIPT="/home/dpustoshilov/AutoDock-Vina/example/autodock_scripts/prepare_gpf.py"
# pythonsh="/home/dpustoshilov/mgltools_x86_64Linux2_1.5.7/bin/pythonsh"
VINA="/home/dpustoshilov/autodock_vina_1_1_2_linux_x86/bin/vina"
AUTOGRID="/home/dpustoshilov/x86_64Linux2/autogrid4"

WORK="/home/dpustoshilov/test/work"
CPUS=4

# cd $WORK_DIR/data/targets/
# for d in ./*.pdb ; do
#     echo "$d"
#     $TARGET_SCRIPT -r $d -o $(basename $d .pdb).pdbqt -A hydrogens
# done

# cd $WORK_DIR/data/ligands/sdf
# for d in ./*.sdf ; do
#     echo "$d"
#     $LIGAND_SCRIPT -r $d -o $(basename $d .sdf).pdbqt -A hydrogens
# done

# $LIGAND_SCRIPT -l 1.sdf -o 1.pdbqt -A hydrogens
# C:\Program Files\OpenBabel-3.1.1>obabel.exe C:\Projects\PSFM_diploma\Searching\data\ligands\sdf\*.sdf -opdbqt -h -m

# for lig in ./lig_red/*lig.pdbqt ; do
#   lig_name=$(basename $lig .pdbqt)
#   for tar in ./temp2/$lig_name/*tar.pdbqt ; do

#     tar_name=$(basename $tar .pdbqt)
#     # echo $tar
#     cp $tar $way/$(basename $tar)
#     echo m$tar_name"_"$lig_name.gpf
#     $pythonsh $PREPARE_SCRIPT -l $lig -r ./$tar_name.pdbqt -y -o maps/m$tar_name"_"$lig_name.gpf
#     rm ./$tar_name.pdbqt
#   done
# done

cd $WORK

rm -rvf $WORK/../output/*
rm -rvf $WORK/../output_log/*
find $WORK -type f -not -name 'prepare.sh' -delete

# vina -h

for lig in $WORK/../ligands/*.pdbqt ; do
  lig_name=$(basename $lig .pdbqt)

  cp $lig $WORK/$(basename $lig)

  for tar in  $WORK/../targets/$lig_name/*.pdbqt ; do
    tar_name=$(basename $tar .pdbqt)
    sum_name=$tar_name"_"$lig_name
    echo $sum_name

    cp $tar $WORK/$(basename $tar)
    cp $WORK/../maps/m$sum_name.gpf $WORK/m$sum_name.gpf

    $AUTOGRID -p $WORK/m$sum_name.gpf -l $WORK/m$sum_name.glg 2>&1 | tee -a  $WORK/../output_log/$sum_name.log

    vina  --ligand $WORK/$lig_name.pdbqt --maps $WORK/$tar_name --scoring ad4 --cpu $CPUS \
        --exhaustiveness 8 --out $WORK/../output/$sum_name.pdbqt 2>&1 | tee -a $WORK/../output_log/$sum_name.log

    find $WORK -type f -not -name 'prepare.sh' -delete
  done
done


