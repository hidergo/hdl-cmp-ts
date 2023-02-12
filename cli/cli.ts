import { readFileSync } from 'fs';
import { argv, exit } from 'process';
import HDLCompiler, { FileReaderInterface } from '../src/HDLCompiler';


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

const readFileInterface : FileReaderInterface = (path, type) => {

    try {
        const buff = readFileSync(path);
        if(type === "text") {
            return buff.toString("utf-8");
        }
        else if(type === "binary") {
            return new Uint8Array(buff);
        }
    }
    catch (e) {
        return undefined;
    }

}

const comp = new HDLCompiler(readFileInterface);

comp.loadFile(sourceFile).then(ok => {
    if(!ok) {
        console.warn("Failed to load source file");
        exit(1);
    }
    comp.compile();
    if(!ok) {
        console.warn("Failed to compile");
        exit(1);
    }
    
    console.log("Compiled");
}).catch(e => {
    console.warn("Failed to compile");
});
