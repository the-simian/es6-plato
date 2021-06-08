
'use strict';

const _ = require('lodash');

class History {
  constructor(data) {
    this.length = 0;
    if (data && data.length) {
      // using lodash to catch array-like objects
      _.each(data, function(record, index){
        this[index] = _.cloneDeep(record);
      }.bind(this));
      this.length = data.length;
    }
  }

  push(obj) {
    this[this.length] = obj;
    this.length++;
  }

  toJSON() {
    var obj = [];
    _.each(this, function(val,index){
      obj[index] = _.cloneDeep(val);
    }.bind(this));
    return obj;
  }
};

module.exports = History;
