/**
 * Welcome to RendererGL Immediate Mode.
 * Immediate mode is used for drawing custom shapes
 * from a set of vertices.  Immediate Mode is activated
 * when you call beginShape() & de-activated when you call endShape().
 * Immediate mode is a style of programming borrowed
 * from OpenGL's (now-deprecated) immediate mode.
 * It differs from p5.js' default, Retained Mode, which caches
 * geometries and buffers on the CPU to reduce the number of webgl
 * draw calls. Retained mode is more efficient & performative,
 * however, Immediate Mode is useful for sketching quick
 * geometric ideas.
 */
'use strict';

var p5 = require('../core/core');
var constants = require('../core/constants');

/**
 * Begin shape drawing.  This is a helpful way of generating
 * custom shapes quickly.  However in WEBGL mode, application
 * performance will likely drop as a result of too many calls to
 * beginShape() / endShape().  As a high performance alternative,
 * please use p5.js geometry primitives.
 * @param  {Number} mode webgl primitives mode.  beginShape supports the
 *                       following modes:
 *                       POINTS,LINES,LINE_STRIP,LINE_LOOP,TRIANGLES,
 *                       TRIANGLE_STRIP,and TRIANGLE_FAN.
 * @return {[type]}      [description]
 */
p5.RendererGL.prototype.beginShape = function(mode){
  //default shape mode is line_strip
  this.immediateMode.shapeMode = (mode !== undefined ) ?
    mode : constants.LINE_STRIP;
  //if we haven't yet initialized our
  //immediateMode vertices & buffers, create them now!
  if(this.immediateMode.vertexPositions === undefined){
    this.immediateMode.vertexPositions = [];
    this.immediateMode.edges = [];
    this.immediateMode.lineVertices = [];
    this.immediateMode.vertexColors = [];
    this.immediateMode.lineNormals = [];
    this.immediateMode.uvCoords = [];
    this.immediateMode.vertexBuffer = this.GL.createBuffer();
    this.immediateMode.colorBuffer = this.GL.createBuffer();
    this.immediateMode.uvBuffer = this.GL.createBuffer();
    this.immediateMode.lineVertexBuffer = this.GL.createBuffer();
    this.immediateMode.lineNormalBuffer = this.GL.createBuffer();
  } else {
    this.immediateMode.vertexPositions.length = 0;
    this.immediateMode.edges.length = 0;
    this.immediateMode.lineVertices.length = 0;
    this.immediateMode.lineNormals.length = 0;
    this.immediateMode.vertexColors.length = 0;
    this.immediateMode.uvCoords.length = 0;
  }
  this.isImmediateDrawing = true;
  return this;
};
/**
 * adds a vertex to be drawn in a custom Shape.
 * @param  {Number} x x-coordinate of vertex
 * @param  {Number} y y-coordinate of vertex
 * @param  {Number} z z-coordinate of vertex
 * @return {p5.RendererGL}   [description]
 * @TODO implement handling of p5.Vector args
 */
p5.RendererGL.prototype.vertex = function(){
  var x, y, z, u, v;

  // default to (x, y) mode: all other arugments assumed to be 0.
  x = arguments[0];
  y = arguments[1];
  z = u = v = 0;

  if (arguments.length === 3) {
    // (x, y, z) mode: (u, v) assumed to be 0.
    z = arguments[2];
  } else if (arguments.length === 4) {
    // (x, y, u, v) mode: z assumed to be 0.
    u = arguments[2];
    v = arguments[3];
  } else if (arguments.length === 5) {
    // (x, y, z, u, v) mode
    z = arguments[2];
    u = arguments[3];
    v = arguments[4];
  }
  var vert = new p5.Vector(x, y, z);
  this.immediateMode.vertexPositions.push(vert);
  var vertexColor = this.curFillColor || [0.5, 0.5, 0.5, 1.0];
  this.immediateMode.vertexColors.push(
    vertexColor[0],
    vertexColor[1],
    vertexColor[2],
    vertexColor[3]);

  this.immediateMode.uvCoords.push(u, v);

  return this;
};

/**
 * End shape drawing and render vertices to screen.
 * @return {p5.RendererGL} [description]
 */
p5.RendererGL.prototype.endShape =
function(mode, isCurve, isBezier,isQuadratic, isContour, shapeKind){
  if(this.drawMode !== constants.TEXTURE) {
    // must switch to immediate mode shader before drawing!
    this.setFillShader(this._getImmediateModeShader());
    // note that if we're using the texture shader...
    // this shouldn't change. :)
  }

  if(this.curStrokeShader.active === true) {
    for(var i=0; i<this.immediateMode.vertexPositions.length; i++) {
      if(i+1 < this.immediateMode.vertexPositions.length) {
        this.immediateMode.edges.push([i, i+1]);
      } else {
        this.immediateMode.edges.push([i, 0]);
      }
    }
    this._edgesToVerticesImmediateMode();
    this._drawStrokeImmediateMode();
  }
  if(this.curFillShader.active === true) {
    this._drawFillImmediateMode(mode, isCurve, isBezier,isQuadratic,
      isContour, shapeKind);
  }
  //clear out our vertexPositions & colors arrays
  //after rendering
  this.immediateMode.vertexPositions.length = 0;
  this.immediateMode.vertexColors.length = 0;
  this.immediateMode.uvCoords.length = 0;
  this.isImmediateDrawing = false;

  return this;
};

/**
 * Create 4 vertices for each stroke line, two at the beginning position
 * and two at the end position. These vertices are displaced relative to
 * that line's normal on the GPU
 * @return {p5.Geometry}
 */
p5.RendererGL.prototype._edgesToVerticesImmediateMode = function() {
  var vertices = this.immediateMode.lineVertices;
  for(var i = 0, max = this.immediateMode.edges.length; i < max; i++)
  {
    var begin = this.immediateMode.vertexPositions[this.immediateMode.edges[i][0]];
    var end = this.immediateMode.vertexPositions[this.immediateMode.edges[i][1]];
    var dir = end.copy().sub(begin).normalize();
    var a = begin,
        b = begin,
        c = end,
        d = end;
    var dirAdd = dir.array();
    var dirSub = dir.array();
    // below is used to displace the pair of vertices at beginning and end
    // in opposite directions
    dirAdd.push(1);
    dirSub.push(-1);
    this.immediateMode.lineNormals.push(dirAdd,dirSub,dirAdd,dirAdd,dirSub,dirSub);
    _store([a, b, c, c, b, d]);
  }

  function _store(verts) {
    for (var i = 0, max = verts.length; i < max; i += 1) {
      verts[i] = verts[i].array();
      vertices.push(verts[i]);
    }
  }
  return this;
};

p5.RendererGL.prototype._drawFillImmediateMode = function(mode, isCurve, isBezier,
  isQuadratic, isContour, shapeKind) {
  var fillShader = this.curFillShader;
  var gl = this.GL;
  fillShader.bindShader();
  //vertex position Attribute
  this._bindBuffer(this.immediateMode.vertexBuffer, gl.ARRAY_BUFFER,
    vToNArray(this.immediateMode.vertexPositions), Float32Array, gl.DYNAMIC_DRAW);
  fillShader.enableAttrib(fillShader.attributes.aPosition.location,
    3, gl.FLOAT, false, 0, 0);
  if (this.drawMode === constants.FILL) {
    this._bindBuffer(this.immediateMode.colorBuffer, gl.ARRAY_BUFFER,
      this.immediateMode.vertexColors, Float32Array, gl.DYNAMIC_DRAW);
    fillShader.enableAttrib(fillShader.attributes.aVertexColor.location,
      4, gl.FLOAT, false, 0, 0);
  }
  if (this.drawMode === constants.TEXTURE){
    //texture coordinate Attribute
    this._bindBuffer(this.immediateMode.uvBuffer, gl.ARRAY_BUFFER,
      this.immediateMode.uvCoords, Float32Array, gl.DYNAMIC_DRAW);
    fillShader.enableAttrib(fillShader.attributes.aTexCoord.location,
      2, gl.FLOAT, false, 0, 0);
  }

  if(mode){
    if(this.drawMode === constants.FILL || this.drawMode === constants.TEXTURE){
      switch(this.immediateMode.shapeMode){
        case constants.LINE_STRIP:
          this.immediateMode.shapeMode = constants.TRIANGLE_FAN;
          break;
        case constants.LINES:
          this.immediateMode.shapeMode = constants.TRIANGLE_FAN;
          break;
        case constants.TRIANGLES:
          this.immediateMode.shapeMode = constants.TRIANGLE_FAN;
          break;
      }
    } else {
      switch(this.immediateMode.shapeMode){
        case constants.LINE_STRIP:
          this.immediateMode.shapeMode = constants.LINE_LOOP;
          break;
        case constants.LINES:
          this.immediateMode.shapeMode = constants.LINE_LOOP;
          break;
      }
    }
  }
  //QUADS & QUAD_STRIP are not supported primitives modes
  //in webgl.
  if(this.immediateMode.shapeMode === constants.QUADS ||
    this.immediateMode.shapeMode === constants.QUAD_STRIP){
    throw new Error('sorry, ' + this.immediateMode.shapeMode+
      ' not yet implemented in webgl mode.');
  }
  else {
    gl.enable(gl.BLEND);
    gl.drawArrays(this.immediateMode.shapeMode, 0,
      this.immediateMode.vertexPositions.length);
  }
  // todo / optimizations? leave bound until another shader is set?
  fillShader.unbindShader();
};

p5.RendererGL.prototype._drawStrokeImmediateMode = function() {
  var gl = this.GL;
  var strokeShader = this.curStrokeShader;
  strokeShader.bindShader();
  this._bindBuffer(this.immediateMode.lineVertexBuffer, gl.ARRAY_BUFFER,
    flatten(this.immediateMode.lineVertices), Float32Array, gl.STATIC_DRAW);
  strokeShader.enableAttrib(strokeShader.attributes.aPosition.location,
    3, gl.FLOAT, false, 0, 0);
  this._bindBuffer(this.immediateMode.lineNormalBuffer, gl.ARRAY_BUFFER,
    flatten(this.immediateMode.lineNormals), Float32Array, gl.STATIC_DRAW);
  strokeShader.enableAttrib(strokeShader.attributes.aDirection.location,
    4, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0,
      this.immediateMode.lineVertices.length);
  // todo / optimizations? leave bound until another shader is set?
  strokeShader.unbindShader();
};

function flatten(arr){
  if (arr.length>0){
    return ([].concat.apply([], arr));
  } else {
    return [];
  }
}

function vToNArray(arr){
  return flatten(arr.map(function(item){
    return [item.x, item.y, item.z];
  }));
}


module.exports = p5.RendererGL;