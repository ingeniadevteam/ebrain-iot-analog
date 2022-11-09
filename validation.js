"use strict";

const joi = require('joi');

const outputsSchema = joi.object({
  name: joi.string().default("out1"),
  init: joi.number().default(25),
  mask: joi.number().default(1)
}).unknown();

const inputsSchema = joi.object({
  name: joi.string().default("in1")
}).unknown();

// the validation schema
const analogSchema = joi.object({
  name: joi.string().default("AIO"),
  type: joi.string().valid('pigeon').default("pigeon"),
  outputs: joi.array().items(outputsSchema),
  inputs: joi.array().items(inputsSchema)
}).unknown();


module.exports = async function (analogObject) {
  // validate the config object
  const validation = analogSchema.validate(analogObject);

  if (validation.error) {
    const errors = [];
    validation.error.details.forEach( detail => {
      errors.push(detail.message);
    });
    // process failed
    throw new Error(`analog validation error: ${errors.join(", ")}`);
  }

  return validation.value;
};
