# HDL documentation

## Contents

* [Introduction](#introduction)
* [Definitons](#definitions)
    * [imgdef](#imgdef)
    * [bind](#bind)
* [Elements](#elements)
    * [Element attributes](#element-attributes)
    * [box](#box)
    * [switch](#switch)


## Introduction

* XML syntax
* Compiled language (small output)
* Designed for microcontrollers
* Bind and show values on the display

## Definitions

### imgdef

Defines an image. Can be either preloaded (Loaded in the source code of the software) or embedded to the document.

|attribute|type|description|required|
|---|---|---|---|
|name|string|Human friendly image name|X|
|src|string|Path to a bitmap. Required if not preloaded|X*|
|preload|number|Preloaded image's ID. Must be >=0x8000. Required if preloaded|X*|
|sw|number|Sprite width||
|sh|number|Sprite height||


*Embedding an image*

```xml
<imgdef name="ICONS" src="./image.bmp" />
...
<box img="ICONS" />
```

*Defining an preloaded image*

```c
// Preloaded images are forced to have an ID of >=0x8000 (MSb high)
// HDL_IMG_image_bmp_c is an uint8_t array which can be generated
// from a bitmap using this compiler 
HDL_PreloadBitmap(&interface, 0x8001, HDL_IMG_image_bmp_c, HDL_IMG_SIZE_image_bmp_c);
```

```xml
<imgdef name="IMAGE" preload="0x8001" />
...
<box img="IMAGE" />
```

*Defining an spritesheet*

```xml
<imgdef name="SPRITES" src="./sprites.bmp" sw="32" sh="32" />
...
<box img="SPRITES" sprite="2" />
```

### bind

Defines a binding. Binding can be used to change values or view in the display code.

|attribute|type|description|required|
|---|---|---|---|
|name|string|Human friendly binding name|X|
|id|number|ID of the binding defined in the source code|X|

*Defining an binding for temperature and pressure, displaying them*

```c
// Temperature in C
float temperature = 26.4f;
// Pressure in hPa
uint16_t pressure = 1044;

HDL_SetBinding(&interface, "TEMPERATURE", 1, HDL_TYPE_FLOAT);
HDL_SetBinding(&interface, "PRESSURE", 2, HDL_TYPE_I16);
```

```xml
<bind name="TEMPERATURE" id="1" />
<bind name="PRESSURE" id="2" />

...
<!-- Use C style formatting -->
<box bind="[$TEMPERATURE, $PRESSURE]">
    %f C \n
    %i hPa
</box>
```

## Elements

### Element attributes

**All elements have the following attributes by default**

**All number values are integers**

|attribute|type|description|required|
|---|---|---|---|
|flex|number|Amount of flex of this element||
|flexdir|'row'\|'col'|Flex direction of children||
|align|string|Alignment of the text. Available values: top/middle/bottom for vertical, left/center/right for horizontal alignment. ex: "top right"||
|padding|number\|number[2]|Padding of children/text. Can be defined seperately for each axis as an array: [x padding, y padding]||
|border|number|Draw a border to the element||
|radius|number|Border radius for rounded corners||
|size|number|Size of the image or text||
|img|string|Image name||
|bind|string\|string[]|Bindings. example: [$BINDING1, BINDING2]||
|value|number|Value of the element||
|disabled|bool|Element is not rendered if disabled is set||

### box

Main building element for layout.

```xml
<box flexdir="row">
    <box flexdir="col">
        <box align="top left">
            Top\nleft
        </box>
        <box align="bottom left">
            Bottom\nleft
        </box>
    </box>
    <box flexdir="col">
        <box align="top right">
            Top\nright
        </box>
        <box align="bottom right">
            Bottom\nright
        </box>
    </box>
</box>
```

### switch

Element which displays a child according to the switch "value" attribute.

```xml
<switch value="0">
    <box>Displayed when value is 0</box>
    <box>Displayed when value is 1</box>
    <box>Displayed when value is 2</box>
</switch>
```