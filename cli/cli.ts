import { readFileSync } from 'fs';
import { argv, exit } from 'process';
import HDLCompiler from '../src/HDLCompiler';


let sourceFile = "";

let param = false;
for(let i = 2; i < argv.length; i++) {
    if(argv[i].charAt(0) === '-') {

    }
    else {
        if(!param) {
            sourceFile = argv[i];
            console.log("Source file " + sourceFile);
        }
    }
}

if(sourceFile.length <= 0) {
    console.error("At least one input file required");
    exit(1);
}

const data = readFileSync(sourceFile);
if(data.length <= 0) {
    console.error("Empty file given");
    exit(1);
}
const comp = new HDLCompiler(data.toString());