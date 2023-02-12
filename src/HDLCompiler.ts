import { X2jOptions, XMLParser, XMLValidator, validationOptions } from 'fast-xml-parser';
import { dirname, extname } from 'path-browserify';

let ecnt = 0;

export type FileReaderInterface = (path: string, type: 'text'|'binary') => (string | Uint8Array | undefined) | Promise<string | Uint8Array>;

export default class HDLCompiler {

    xmlDoc : object = {};

    document : HDLDocument = new HDLDocument();

    public basePath : string = "./";

    private imageRunningNumber : number = 0;

    /**
     * @brief Interface for file reading. Must be set to load images
     */
    public static readFileInterface : FileReaderInterface | undefined = undefined;

    constructor(readFileInterface?: FileReaderInterface) {

        if(readFileInterface) {
            HDLCompiler.readFileInterface = readFileInterface;
        }
    }

    public load (xml: string) : Promise<boolean> {
        
        if(!HDLCompiler.readFileInterface) {
            console.warn("File reading interface not set. Can't load bundled images");
        }

        return new Promise(async (res, rej) => {
            const validatorOptions : Partial<validationOptions> = {
                
            }
    
            const parseOptions : Partial<X2jOptions> = {
                preserveOrder: true,
                ignoreAttributes: false
            }
    
            const valResult = XMLValidator.validate(xml, validatorOptions);
    
            if(valResult !== true) {
                console.log("XML validation failed: ");
                console.log(valResult);
                res(false);
                return;
            }
    
            const parser = new XMLParser(parseOptions);
    
            this.xmlDoc = parser.parse(xml);
    
            this.document = new HDLDocument();
    
    
            if(!this.xmlDoc) {
                console.error("ERROR: Failed to parse XML");
                res(false);
                return;
            }
            
            if(Array.isArray(this.xmlDoc)) {
                for(let o of this.xmlDoc) {
                    await this.parseXMLElement(o);
                }
            }
            else {
                for(let o in this.xmlDoc) {
                    await this.parseXMLElement((this.xmlDoc as {[key: string]: any})[o]);
                }
            }
    
            res(true);
        })

    }

    public loadFile (path: string) : Promise<boolean> {
        return new Promise (async (res, rej) => {
            if(!HDLCompiler.readFileInterface) {
                console.warn("Can't read a file without setting HDLCompiler.readFileInterface");
                res(false);
                return;
            }

            let xml : string | Uint8Array | undefined;

            let xm = HDLCompiler.readFileInterface(path, "text");

            if(xm instanceof Promise) {
                xml = await xm;
            }
            else {
                xml = xm;
            }

            if(xml) {
                if(typeof xml === "string") {
                    // OK
                }
                else if(xml instanceof Uint8Array) {
                    console.log("Expected string instead of Uint8Array");
                    res(false);
                    return;
                }
            }
            else {
                console.log("Could not load file");
                res(false);
                return;
            }
        
            this.basePath = dirname(path) + "/";
        
            let l = await this.load(xml);

            res(l);
        });
    }
    
    public compile () : Uint8Array {

        const bytes = this.document.compile();

        return bytes;
    }

    private async parseXMLElement (element: {[key: string]: any}, parent?: HDLElement | null) : Promise<boolean> {
        
        return new Promise(async (res, rej) => {

            let tagFound = false;
            let el : {tag: string, attrs: {[key: string]: any}} = {
                tag: "",
                attrs: {}
            }
            ecnt++;
            for(let k in element) {
                if(k === ':@') {
                    // ATTRIBUTES
                    for(let a in element[k]) {
                        el.attrs[a.replace("@_", "")] = element[k][a];
                    }
                }
                else if(k === '#text') {
                    if(parent) {
                        parent.content = element[k].toString();
                    }
                }
                else {
                    // TAG
                    if(tagFound) {
                        console.error("ERROR: Multiple tags for object");
                        res(false);
                        return;
                    }
                    el.tag = k;
                    tagFound = true;
                }
            }
    
            if(!tagFound) {
                //console.error("ERROR: Tag not found");
                res(false);
                return;
            }
    
            if(el.tag === "imgdef") {
                // Image definition
                const img = new HDLImage();
                
                img.name = el.attrs["name"];
                img.preloaded = el.attrs["preload"] !== undefined;
                img.id = img.preloaded ? (0x8000 | el.attrs["preload"]) : this.imageRunningNumber++;
    
                if(!img.preloaded) {
                    let loaded = await img.load(el.attrs["src"], this);
                    if(!loaded) {
                        console.log("Failed to load image");
                        res(false);
                        return;
                    }
                }
                if(el.attrs["sw"] !== undefined) {
                    img.sprite_width = el.attrs["sw"] as number;
                }
                if(el.attrs["sh"] !== undefined) {
                    img.sprite_height = el.attrs["sh"] as number;
                }
                
                this.document.images.push(img);
                res(true);
                return;
            }
            else if(el.tag === "bind") {
                // Binding
                if(el.attrs["name"] === undefined || el.attrs["id"] === undefined) {
                    console.error("BIND definition requires 'name' and 'id' attributes!");
                    res(true);
                    return;
                }
                this.document.bindings.push({name: el.attrs["name"], id: el.attrs["id"]});
            }
            else if(Object.keys(HDLTagName).find(e => e === el.tag)) {
                // Tag
                const nel = new HDLElement(el.tag, this.document, parent);
    
                nel.attrs = el.attrs;
                nel.tag = el.tag;
    
                // Children
                for(let c of element[el.tag]) {
                    if(!(await this.parseXMLElement(c, nel))) {
                        res(false);
                        return;
                    }
                }
            }
            
            res(true);
            return;
        })
    }


}

enum HDLColorMode {
    HDL_COLORS_UNKNOWN,
    // MONO (black and white)
    HDL_COLORS_MONO,
    // RGB colors
    HDL_COLORS_24BIT,
    // Color pallette
    HDL_COLORS_PALLETTE
}

const HDLTagName : {[key: string]: number} = {
    // Box - standard middle center aligned flex element
    "box":      0,
    // Switch - element that switches child disabled state according to "value" attribute
    "switch":   1
}

const HDLTransformList : {[key: string]: number} = {
    // Column/row
    "col":              1,
    "row":              2,
    // Alignment
    "middle center":    0x00,
    "middle left":      0x01,
    "middle right":     0x02,
    "top center":       0x10,
    "top left":         0x11,
    "top right":        0x12,
    "bottom center":    0x20,
    "bottom left":      0x21,
    "bottom right":     0x22,
}

const HDLAttrName : {[key: string]: number} = {
    "x":        0,
    "y":        1,
    "width":    2,
    "height":   3,
    "flex":     4,
    "flexdir":  5,
    "bind":     6,
    "img":      7,
    "padding":  8,
    "align":    9,
    "size":     10,
    "disabled": 11,
    "value":    12,
    "sprite":   13,
    "widget":   14,
    "border":   15,
    "radius":   16
}

enum HDLType {
    HDL_TYPE_NULL       = 0,
    HDL_TYPE_BOOL       = 1,
    HDL_TYPE_FLOAT      = 2,
    HDL_TYPE_STRING     = 3,
    HDL_TYPE_I8         = 4,
    HDL_TYPE_I16        = 5,
    HDL_TYPE_I32        = 6,
    HDL_TYPE_IMG        = 7,
    HDL_TYPE_BIND       = 8,

    // Tell's how many types have been defined
    HDL_TYPE_COUNT
};

/*
struct __attribute__((packed)) _BMP_Head {
    // File header
    struct __attribute__((packed)) {
        // File signature, must be "BM"
        char signature[2]; 0-1
        // File size
        uint32_t size; 2-5
        // Reserved
        uint8_t reserved0[4]; 6-9
        // Pixel offset
        uint32_t pixelOffset; 10-13
    } fileHeader;

    // Image header
    struct __attribute__((packed)) {
        // Header size
        uint32_t headerSize; 14-17
        // Image width
        int32_t imageWidth; 18-21
        // Image height
        int32_t imageHeight; 22-25
        // Planes
        uint16_t planes; 26-27
        // Bits per pixel
        uint16_t bitsPerPixel; 28-29
        // Compression
        uint32_t compression; 30-33
        // Image size
        uint32_t imageSize; 34-37
        // X Pixels per meter
        int32_t xPixelsPerMeter; 38-41
        // Y Pixels per meter
        int32_t yPixelsPerMeter; 42-45
        // Total colors
        uint32_t totalColors; 46-49
        // Important colors
        uint32_t importantColors; 50-53
    } imageHeader;
};
*/

class HDLImage {
    name:           string = "";
    id:             number = 0xFFFF;
    size:           number = 0;
    width:          number = 0;
    height:         number = 0;
    sprite_width:   number = 0;
    sprite_height:  number = 0;
    colorMode:      HDLColorMode = HDLColorMode.HDL_COLORS_UNKNOWN;
    data:           Uint8Array = new Uint8Array(0);
    preloaded:      boolean = false;

    
    async load (path: string, compiler: HDLCompiler) : Promise<boolean> {

        return new Promise(async (res, rej) => {
            // Check extension
            if(extname(path) !== '.bmp') {
                console.warn("HDLImage.load: only .bmp supported");
                res(false);
                return;
            }

            try {
                let arr : undefined | string | Uint8Array = new Uint8Array(0);
                if(HDLCompiler.readFileInterface) {
                    let xm = HDLCompiler.readFileInterface(path, "binary");

                    if(xm instanceof Promise) {
                        arr = await xm;
                    }
                    else {
                        arr = xm;
                    }

                    if(arr === undefined || typeof arr === "string") {
                        res(false);
                        return;
                    }
                }
                else {
                    res(false);
                    return;
                }
                const dv = new DataView(arr.buffer);

                if(arr.length < 54) {
                    console.warn("HDLImage.load: Input bmp file too short");
                    res(false);

                    return;
                }
                if(dv.getUint8(0) !== 0x42 || dv.getUint8(1) !== 0x4D) {
                    console.warn("HDLImage.load: Incorrect bitmap header " + dv.getUint8(0) + " " + dv.getUint8(1));
                    res(false);
                    return;
                }
                if(dv.getUint16(28, true) !== 1) {
                    console.warn("HDLImage.load: Only monocolor images supported");
                    res(false);
                    return;
                }

                const row_l = Math.floor((dv.getInt32(18, true) + 7) / 8);
                const row_l_pad = (((dv.getInt32(18, true) + 31) & ~31) >> 3);

                this.colorMode = HDLColorMode.HDL_COLORS_MONO;
                this.width = dv.getInt32(18, true);
                this.height = dv.getInt32(22, true);
                this.size = row_l * this.height;

                // Set sprite width, height if not set
                if(this.sprite_width === 0)
                    this.sprite_width = this.width;

                if(this.sprite_height === 0) 
                    this.sprite_height = this.height;

                this.data = new Uint8Array(this.size);

                const pxoff = dv.getUint32(10, true);

                let inx = pxoff;

                for(let i = this.height - 1; i >= 0; i--) {
                    for(let p = 0; p < row_l; p++) {
                        this.data[row_l * i + p] = dv.getUint8(inx);
                        inx++;
                    }
                    if(row_l != row_l_pad) {
                        // Skip padding
                        inx += row_l_pad - row_l;
                    }
                }

            }
            catch (e) {
                console.warn("HDLImage.load: Could not open '" + path + "'" + e);
                res(false);
                return;
            }

            res(true);
        })
        
    }

    compile () : Uint8Array {
        let bytes : number[] = [];

        bytes.push(this.id & 0xFF);
        bytes.push((this.preloaded ? 0x80 : 0) | ((this.id >> 8) & 0xFF));

        bytes.push(this.size & 0xFF);
        bytes.push(this.size >> 8);

        bytes.push(this.width & 0xFF);
        bytes.push(this.width >> 8);

        bytes.push(this.height & 0xFF);
        bytes.push(this.height >> 8);

        bytes.push(this.sprite_width);
        bytes.push(this.sprite_height);

        bytes.push(this.colorMode);

        for(let i = 0; i < this.data.length; i++) {
            bytes.push(this.data[i]);
        }

        return new Uint8Array(bytes);
    }
}

class HDLDocument {

    colorMode: HDLColorMode = HDLColorMode.HDL_COLORS_UNKNOWN;

    images: HDLImage[] = [];

    elements: HDLElement[] = [];

    bindings: {name: string, id: number}[] = [];

    compile () : Uint8Array {
        let bytes : number[] = [];

        // Compiler minor/major version
        bytes.push(0x00);
        bytes.push(0x02);

        // Bitmap count
        bytes.push(this.images.filter(e => !e.preloaded).length);

        // Reserved / Vartable count
        bytes.push(0);

        // Element count
        bytes.push(this.elements.length & 0xFF);
        bytes.push((this.elements.length >> 8) & 0xFF);

        // Padding until 16
        while(bytes.length < 16) {
            bytes.push(0);
        }

        // Images
        for(let b of this.images) {
            if(!b.preloaded)
                bytes = bytes.concat(Array.from(b.compile()));
        }
        // Elements
        bytes = bytes.concat(Array.from(this.elements[0].compile()));

        return new Uint8Array(bytes);
    }

}

class HDLElement {

    tag: string;

    attrs: {[key: string]: string} = {};

    content: string = "";

    doc: HDLDocument;

    parent: HDLElement | null = null;

    children: HDLElement[] = [];

    constructor(tag : string, doc : HDLDocument, parent?: HDLElement | null) {
        this.tag = tag;
        this.doc = doc;
        if(parent) {
            this.parent = parent;
            this.parent.children.push(this);
        }
        doc.elements.push(this);
    }

    compile () : Uint8Array {
        let bytes : number[] = [];

        // Tag name
        const tagId = HDLTagName[this.tag];
        if(tagId === undefined) {
            // ERROR: Unknown tag name
            return new Uint8Array(0);
        }
        bytes.push(tagId);

        // Content
        for(let i = 0; i < this.content.length; i++) {
            bytes.push(this.content.charCodeAt(i));
        }
        // Null terminator
        bytes.push(0);

        // Attributes
        const attrCountIndex = bytes.push(Object.keys(this.attrs).length) - 1;

        for(let i = 0; i < Object.keys(this.attrs).length; i++) {
            const attrId = HDLAttrName[Object.keys(this.attrs)[i]];
            if(!attrId) {
                // WARNING: Unknown attr name
                bytes[attrCountIndex]--;
                continue;
            }
            
            let parsedVal = parseValue(this.attrs[Object.keys(this.attrs)[i]], this.doc);
            if(parsedVal.type === HDLType.HDL_TYPE_NULL) {
                // WARNING: Could not parse
                bytes[attrCountIndex]--;
                continue;
            }
            bytes.push(attrId);
            bytes.push(parsedVal.type);
            bytes.push(Array.isArray(parsedVal.value) ? parsedVal.value.length : 1);
            
            // Compile value
            const valArr = Array.isArray(parsedVal.value) ? parsedVal.value : [parsedVal.value];
            for(let i = 0; i < valArr.length; i++) {
                switch(parsedVal.type) {
                    case HDLType.HDL_TYPE_BIND:
                    case HDLType.HDL_TYPE_BOOL:
                    case HDLType.HDL_TYPE_I8:
                        bytes.push(valArr[i]);
                        break;
                    case HDLType.HDL_TYPE_I16:
                    case HDLType.HDL_TYPE_IMG:
                        bytes.push(valArr[i] & 0xFF);
                        bytes.push((valArr[i] >> 8) & 0xFF);
                        break;
                    case HDLType.HDL_TYPE_I32:
                        bytes.push(valArr[i] & 0xFF);
                        bytes.push((valArr[i] >> 8) & 0xFF);
                        bytes.push((valArr[i] >> 16) & 0xFF);
                        bytes.push((valArr[i] >> 24) & 0xFF);
                        break;
                    case HDLType.HDL_TYPE_FLOAT:
                        const f_arr = new Float32Array([valArr[i]]);
                        const u8_arr = new Uint8Array(f_arr.buffer);
                        bytes.push(u8_arr[0]);
                        bytes.push(u8_arr[1]);
                        bytes.push(u8_arr[2]);
                        bytes.push(u8_arr[3]);
                        break;
                }
            }

        }

        bytes.push(this.children.length);
        
        for(let c of this.children) {
            bytes = bytes.concat(Array.from(c.compile()));
        }
        
        return new Uint8Array(bytes);
    }
}

function parseValue (value: string, document: HDLDocument) : {type: HDLType, value: number|number[]} {
    let typeOut = HDLType.HDL_TYPE_NULL;
    let valueOut : number|number[] = 0;
    if(value.charAt(0) === '['.charAt(0)) {
        // ARRAY
        if(value.charAt(value.length - 1) !== ']'.charAt(0)) {
            console.warn("WARNING: Missing ] from array");
            return { type: HDLType.HDL_TYPE_NULL, value: 0 };
        }
        
        let vals = value.slice(1, value.length - 1).split(',');
        valueOut = vals.filter((v) => !v.includes(",")).map((v) => {
            
            let parsedVal = parseValue(v, document);
            typeOut = parsedVal.type;
            return parsedVal.value as number;
        })
    }
    else {
        let val = parseFloat(value);
        if(!isNaN(val)) {
            // Number
            if(Math.floor(Math.abs(val)) - val > 0.00001) {
                // Float
                typeOut = HDLType.HDL_TYPE_FLOAT;
                valueOut = val;
            }
            else {
                // Integer
                if(Math.abs(val) < 0x7F) {
                    typeOut = HDLType.HDL_TYPE_I8;
                }
                else if(Math.abs(val) < 0x7FFF) {
                    typeOut = HDLType.HDL_TYPE_I16;
                }
                else/* if(Math.abs(val) < 0x7FFFFFFF)*/ {
                    typeOut = HDLType.HDL_TYPE_I32;
                }
                valueOut = Math.floor(val);
            }
        }
        else {
            if(value.charAt(0) === '$'.charAt(0)) {
                // Binding
                let valstr = value.slice(1);
                let bnd = document.bindings.find((e) => {
                    return (e.name === valstr);
                })
                if(bnd) {
                    typeOut = HDLType.HDL_TYPE_BIND;
                    valueOut = bnd.id;
                }
                else {
                    console.warn("WARNING: Binding " + value + " not found");
                    return { type: HDLType.HDL_TYPE_NULL, value: 0 };
                }
            }
            else {
                // Transform from string to int
                let tf : HDLImage | string | undefined = Object.keys(HDLTransformList).find(e => e === value);
                if(tf) {
                    const val = HDLTransformList[tf];
                    // Integer
                    if(Math.abs(val) < 0x7F) {
                        typeOut = HDLType.HDL_TYPE_I8;
                    }
                    else if(Math.abs(val) < 0x7FFF) {
                        typeOut = HDLType.HDL_TYPE_I16;
                    }
                    else/* if(Math.abs(val) < 0x7FFFFFFF)*/ {
                        typeOut = HDLType.HDL_TYPE_I32;
                    }
                    valueOut = Math.floor(val);
                }
                // Image?
                else if((tf = document.images.find(e => e.name === value))) {
                    if(tf.preloaded) {
                        typeOut = HDLType.HDL_TYPE_NULL;
                        valueOut = 0;
                    }
                    else {
                        typeOut = HDLType.HDL_TYPE_IMG;
                        valueOut = Math.floor(tf.id);
                    }
                }
                else {
                    // String?
                    console.warn("WARNING: String attributes not supported");
                    return { type: HDLType.HDL_TYPE_NULL, value: 0 };
                }
            }
        }
    }
    return { type: typeOut, value: valueOut };

}