/**
 * @file gsTransform.js
 * @description Lightweight transformer for Jest to parse .gs files as standard JavaScript.
 */

module.exports = {
  process(sourceText) {
    return {
      code: sourceText,
    };
  },
};

