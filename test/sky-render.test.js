import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyView, ZOOM_MIN, ZOOM_MAX, atmosphereAltitude } from '../client/skyview.js';
import { cityById } from '../src/cities.js';

test('wide camera pans do not repeat the old 12-unit world or stop at old vertical bounds', () => {
  const sky = Object.assign(Object.create(SkyView.prototype), {w:1000,h:800,centerX:6,centerY:0,zoom:1});
  sky.panBy(-18000,-270000);
  assert.ok(sky.centerX > 12);
  assert.equal(sky.centerY,300);
  sky.zoomAt(0.001,500,400);
  assert.equal(sky.zoom, 0.08);
  sky.zoomAt(100000,500,400);
  assert.equal(sky.zoom, 1);
  assert.ok(sky.zoom >= ZOOM_MIN && sky.zoom <= ZOOM_MAX);
  assert.equal(atmosphereAltitude(-1000),12);
});

test('restored camera zoom is clamped to 8–100 percent', () => {
  const sky = Object.assign(Object.create(SkyView.prototype), {w:1000,h:800,centerX:6,centerY:0,zoom:1});
  for (const [saved, expected] of [[0.0001, 0.08], [128, 1], [0.5, 0.5]]) {
    sky.setCamera(6, 0, saved);
    assert.equal(sky.zoom, expected);
  }
});

test('Moscow day/night rendering stays painted during resolution changes and lower sky retains clouds', () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const canvas = () => {
    let width=0,height=0;
    const c = { painted:false };
    Object.defineProperties(c, {
      width: {get:()=>width,set:v=>{width=v;c.painted=false;}},
      height: {get:()=>height,set:v=>{height=v;c.painted=false;}},
    });
    const ctx = {
      createImageData: (w,h) => ({data:new Uint8ClampedArray(w*h*4)}),
      putImageData: () => {c.painted=true;},
      setTransform() {},
      drawImage: source => assert.equal(source.painted,true,'a resized blank buffer must never be drawn'),
    };
    c.getContext = () => ctx;
    return c;
  };
  globalThis.document={createElement:canvas};
  globalThis.window={devicePixelRatio:1};
  try {
    const sky=new SkyView(canvas(),{reducedMotion:false});
    sky.resize(320,480);
    const city=cityById('ru-moscow');
    assert.ok(city);
    for (const method of ['drawStars','drawMoon','drawSunDisc','drawPrecip','drawCompass','drawMessages','drawFlash','watchFrame']) sky[method]=()=>{};
    for (const hour of [0,12]) {
      const now=Date.UTC(2026,9,26,hour);
      sky.setCity(city,now);
      sky.wx.cloud=sky.target.cloud=0.7;
      sky.centerY=300;
      sky.buildMs=20; // force resolution adaptation
      sky.frame(now,1000+hour*1000);
      assert.equal(sky.skyBuf.painted,true);
      const lower=sky.cloudImg.data.slice(Math.floor(sky.cloudBuf.height*0.8)*sky.cloudBuf.width*4);
      assert.ok(lower.some((v,i)=>i%4===3&&v>0),'clouds continue into the lower viewport');
    }
  } finally {
    globalThis.document=oldDocument; globalThis.window=oldWindow;
  }
});
