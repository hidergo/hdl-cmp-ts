import { X2jOptions, XMLParser } from 'fast-xml-parser';

export default class HDLCompiler {

    xmlDoc : object;

    document : HDLDocument;

    imageRunningNumber : number = 0;

    parseXMLElement (element: object) {
        let tagFound = false;
        let el = {
            tag: "",
            attrs: {}
        }
        for(let k in element) {
            if(k === ':@') {
                // ATTRIBUTES
                for(let a in element[k]) {
                    el.attrs[a] = element[k][a];
                }
            }
            else {
                // TAG
                if(tagFound) {
                    console.error("ERROR: Multiple tags for object");
                    return false;
                }
                el.tag = k;
                tagFound = true;
            }
        }

        if(!tagFound) {
            console.error("ERROR: Tag not found");
            return false;
        }

        if(el.tag === "imgdef") {
            // Image definition
            const img = new HDLImage();
            
            img.name = el.attrs["name"];
            img.preloaded = el.attrs["preload"] !== undefined;
            img.id = img.preloaded ? (0x8000 | el.attrs["preload"]) : this.imageRunningNumber++;

            if(!img.preloaded) {
                img.load(el.attrs["src"]);
            }
            
            this.document.images.push(img);
            return true;
        }

        // Children
        for(let c of element[el.tag]) {
            if(!this.parseXMLElement(c)) {
                return false;
            }
        }
        return true;
    }

    constructor(data: string) {

        const options : Partial<X2jOptions> = {
            preserveOrder: true,
            ignoreAttributes: false
        }

        const parser = new XMLParser(options);
        this.xmlDoc = parser.parse(data);

        if(!this.xmlDoc) {
            console.error("ERROR: Failed to parse XML");
            return;
        }

        this.document = new HDLDocument();

        if(Array.isArray(this.xmlDoc)) {
            for(let o of this.xmlDoc) {
                this.parseXMLElement(o);
            }
        }
        else {
            for(let o in this.xmlDoc) {
                this.parseXMLElement(this.xmlDoc[o]);
            }
        }

        //console.log(JSON.stringify(this.xmlDoc, null, 2));
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

const HDLTagName = {
    // Box - standard middle center aligned flex element
    "box":      0,
    // Switch - element that switches child disabled state according to "value" attribute
    "switch":   1
}

const HDLTransformList = {
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

const HDLAttrName = {
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
    "widget":   14
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


class HDLImage {
    name:           string;
    id:             number;
    size:           number;
    width:          number;
    height:         number;
    sprite_width:   number;
    sprite_height:  number;
    colorMode:      HDLColorMode;
    data:           Uint8Array;
    preloaded:      boolean;

    
    load (path: string) {
        
    }

    compile () : Uint8Array {
        let bytes : number[] = [];

        bytes.push((this.preloaded ? 0x80 : 0) | (this.id & 0xFF));
        bytes.push(this.id >> 8);

        bytes.push(this.size & 0xFF);
        bytes.push(this.size >> 8);

        bytes.push(this.width & 0xFF);
        bytes.push(this.width >> 8);

        bytes.push(this.height & 0xFF);
        bytes.push(this.height >> 8);

        bytes.push(this.sprite_width);
        bytes.push(this.sprite_height);

        bytes.push(this.colorMode);

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

    bindings: {name: string, value: number}[] = [];

    compile () : Uint8Array {
        let bytes : number[] = [];

        // Compiler minor/major version
        bytes.push(0x00);
        bytes.push(0x02);

        // Bitmap count
        bytes.push(this.images.length);

        // Reserved / Vartable count
        bytes.push(0);

        // Element count
        bytes.push(this.elements.length & 0xFF);
        bytes.push((this.elements.length >> 8) & 0xFF);

        // Padding until 16
        while(bytes.length <= 16) {
            bytes.push(0);
        }

        // Images
        for(let b of this.images) {
            const bt = b.compile();

            for(let i = 0; i < bt.length; i++) {
                bytes.push(bt[i]);
            }
        }

        // Elements
        for(let e of this.elements) {
            const et = e.compile();

            for(let i = 0; i < et.length; i++) {
                bytes.push(et[i]);
            }
        }

        return new Uint8Array(bytes);
    }

}

class HDLElement {

    tag: string;

    attrs: {[key: string]: string} = {};

    content: string;

    doc: HDLDocument;

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
            if(attrId) {
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
        
        let vals = value.slice(1, value.length - 2).split(',');
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
                    valueOut = bnd.value;
                }
                else {
                    console.warn("WARNING: Binding " + value + " not found");
                    return { type: HDLType.HDL_TYPE_NULL, value: 0 };
                }
            }
            else {
                // Transform from string to int
                let tf : HDLImage | string | undefined = Object.keys(HDLTransformList).find(e => HDLTransformList[e] === value);
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