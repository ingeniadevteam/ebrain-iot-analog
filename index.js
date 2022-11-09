"use strict";

const spi = require('spi-device');
const loadJsonFile = require('load-json-file');
const bufferpack = require('bufferpack');
const round = require('round-to');


module.exports = async function (app) {
  const config = await loadJsonFile(`${app.configDir}/analog.json`);
  app.analog.config = await require(`./validation`)(config);

  const isDev = process.env.NODE_ENV === 'development';

  // the state is a copy of the config plus some fields
  app.analog.state = Object.assign({}, config);

  app.analog.read = async (app) => {
    // setup the request
    let req = Buffer.from([0x41]);
    let tx = Buffer.from([0x41, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    let rx = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0]);

    // try to write to the spi device
    let device, response, message;
    if (!isDev) {
      try {
        device = spi.openSync(0, 1, { mode: spi.MODE1 });
      } catch (e) {
        e.message += " - openSync";
        throw e;
      }
      message = [{
        sendBuffer: tx,
        receiveBuffer: rx,
        byteLength: 9,
        speedHz: 20000
      }];
      try {
        device.transferSync(message);
      } catch (e) {
        e.message += " - transferSync";
        throw e;
      }

      try {
        device.closeSync();
      } catch (e) {
        e.message += " - closeSync";
        throw e;
      }
    }

    const format = '<B(h)H(V1)H(V2)H(V3)H(V4)';
    const unpacked = bufferpack.unpack(format, rx, 0);
  
    const result = Object.keys(unpacked).filter(key => key.includes('V')).map(key => 
      round(unpacked[key] * 10.065 / 1023.0, 3)
    );

    // update state inputs
    const resultObject = {};
    if (app.analog.state.inputs) {
      app.analog.state.inputs.map((inp, index) => {
        inp["in"] = result[index];
      });
      app.analog.state.inputs.forEach(i => {
        resultObject[i.name] = i.in;
      });
    } else {
      result.forEach((r, index) => {
        resultObject[`IN${index}`] = r;
      });
    }

    if (isDev) {
      try {
        const devData = await loadJsonFile(`devdata/analog.json`);
        if (devData) app.analog.data = devData;
        return devData;
      } catch (error) {
        app.logger.error(`modbus analog: ${error.message}`);
      }
    }

    app.analog.data = resultObject;
    return resultObject;
  };

  const scale = function (value) {
    // From Pigeon:
    // The value 1000 corresponds to the output voltage 10V.
    let scaled, buffer;
    // single value?
    if (typeof value === 'number') {
      // alloc a 2 byte buffer
      buffer = Buffer.alloc(2);
      buffer.writeInt16LE(value * 10);
      return buffer;
    } else {
      // array of values
      if (Array.isArray(value)) {
        return value.map( (v) => {
          // alloc a 4 byte buffer
          buffer = Buffer.alloc(2);
          buffer.writeInt16LE(v * 10);
          return buffer;
        });
      }
    }
  };

  app.analog.write = async (app, name, value, outName) => {
    // some vars
    let out, stream, single;
    // setup the header
    const header = Buffer.from([0x4f]);
    // passing the "mask" as the third parameter is allowed
    if (typeof outName === "number") {
      out = app.analog.state.outputs.find( (out) => {
        return out.mask === outName;
      });
      if (!out.name) {
        throw new Error(`no output name for mask ${mask} on ${name}`);
      }
      // rewirte outName
      outName = out.name;
    }

    // single output?
    if (outName) {
      if (typeof value === 'number') {
        if (value > 100 || value < 0) {
          throw new Error(`analog value: ${value} >= 0 && ${value} <= 100`);
        }
        if (out) {
          // check if values are equals
          if (value === out.out) {
            app.logger.debug(`same output value ${value} on AIO ${outName}`);
            return;
          }
          // scale value
          const scaled = scale(value);
          // setup "disabled" channel value
          const disabled = Buffer.from([0x00, 0x80]);
          // setup the complete stream
          if (out.mask === 1) {
            stream = Buffer.concat([header, scaled, disabled], 5);
          } else if (out.mask === 2) {
            stream = Buffer.concat([header, disabled, scaled], 5);
          }
        } else {
          throw new Error("output name not found");
        }
      } else {
        throw new Error("value must be a number");
      }
    } else {
      // all outputs?
      if (Array.isArray(value)) {
        if (value.length === 2) {
          const valueError = value.filter( (v) => {
            return v > 100 || v < 0;
          });
          // check value error
          if (valueError.length) {
            throw new Error(`valueError: ${valueError.toString()}`);
          }
          // scale values and setup a buffer
          const scaled = scale(value);
          // setup the complete stream
          stream = Buffer.concat([header, scaled[0], scaled[1]], 5);
        } else {
          throw new Error("array must contain 4 items");
        }
      } else {
        throw new Error("value must be an array");
      }
    }

    // try to write to the spi device
    let device, response;
    if (!isDev) {
      try {
        device = spi.openSync(0, 1, { mode: spi.MODE1 });
      } catch (e) {
        e.message += " - openSync";
        throw e;
      }

      const message = [{
        sendBuffer: stream,
        // receiveBuffer: Buffer.alloc(5),
        byteLength: 5,
        speedHz: 20000
      }];
      try {
        response = device.transferSync(message);
      } catch (e) {
        e.message += " - transferSync";
        throw e;
      }

      try {
        device.closeSync();
      } catch (e) {
        e.message += " - closeSync";
        throw e;
      }
    }

    // update state values
    if (out) {
      const index = app.analog.state.outputs.findIndex((state => state.name === outName));
      app.analog.state.outputs[index].out = value;
      app.logger.debug(`AIO:${outName} ${stream.toString('hex')}`);
    } else {
      app.analog.state.outputs.forEach( (o, index) => {
        o['out'] = value[index];
      });
      app.logger.debug(`AIO: ${stream.toString('hex')}`);
    }

  };

  // setup output initial values
  if (app.analog.state.hasOwnProperty("outputs")) {
    await app.analog.write(app, app.analog.state.name, [app.analog.state.outputs[0].init,
      app.analog.state.outputs[1].init]);
  }

  if (app.analog.state.hasOwnProperty("inputs")) {
    await app.analog.read(app);
  }
}
