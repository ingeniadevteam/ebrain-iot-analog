# Pigeon analog module

A module for the [Pigeon analog outputs](http://pigeoncomputers.com/documentation/hardware/analog-io/)

## Config

config/analog.json
```json
{
  "name": "Aout",
  "outputs": [
    {
      "name": "out1",
      "init": 25,
      "mask": 1
    },
    {
      "name": "out2",
      "init": 25,
      "mask": 2
    }      
  ]
}
```

## Functions

**set(deviceName, value, outName)**

Examples:

```js
.set("Aout", [25, 50])     // using an array
.set("Aout", 33, "out1")   // using out name
.set("Aout", 33, 1)        // using out mask (1, 2)
```
