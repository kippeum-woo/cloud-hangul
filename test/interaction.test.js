import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupply } from '../server/core/supply.js';
import { createComposer } from '../src/composer.js';
import { blockText, canAdd } from '../src/hangul.js';
import { GLYPH } from '../src/messages.js';
import { Writing } from '../client/writing.js';
import { SkyView } from '../client/skyview.js';
import { bindZoomInput, wheelZoomFactor } from '../client/zoom-input.js';

test('rapid tray clicks compose syllables in order and carry finals forward without losing reservations', async () => {
  for (const [input, expected] of [
    ['ㄱㅏㄴㅏ', '가나'], ['ㅎㅏㄴㄱㅡㄹ', '한글'],
    ['ㄷㅏㄹㄱㅏ', '달가'], ['ㄱㅏㄲㅏ', '가까'],
    ['ㄱㅗㅏㅈㅏ', '과자'], ['ㅇㅏㄴㄴㅕㅇ', '안녕'],
  ]) {
    const c = createComposer();
    let n = 0;
    const writing = Object.assign(Object.create(Writing.prototype), {
      composer:c, selected:null, sky:{unit:100,w:1000,h:800,toScreen:()=>({x:500,y:400}),toSky:()=>({x:5,y:0})},
      reserve:async()=>`r${++n}`, tray:{nudge:()=>assert.fail('unexpected claim failure')},
      select(id){this.selected=id;}, pulse(){}, changed(){},
    });
    await Promise.all([...input].map(l=>writing.tapLetter(l)));
    assert.equal(c.blocks.map(b=>c.text(b)).join(''),expected);
    assert.equal(c.rids().length,input.length);
    assert.equal(new Set(c.rids()).size,input.length);
    const restored = createComposer(c.save());
    assert.equal(restored.blocks.map(b=>restored.text(b)).join(''),expected);
    if (input === 'ㄱㅏㄴㅏ') {
      assert.deepEqual(c.undo(),{release:['r4']});
      assert.equal(c.blocks.map(b=>c.text(b)).join(''),'간');
      assert.deepEqual(c.undo(),{release:['r3']});
      assert.equal(c.text(c.blocks[0]),'가');
    }
  }
});

test('release removes editable hit targets and clears active letter gestures immediately', () => {
  let removed = 0;
  const writing = Object.assign(Object.create(Writing.prototype), {
    els: new Map([['a', {remove: () => removed++}]]),
    drag: {kind:'block'}, selected:'a', guide:{hidden:false}, ghost:{hidden:false},
  });
  writing.finishRelease();
  assert.equal(removed, 1);
  assert.equal(writing.els.size, 0);
  assert.equal(writing.drag, null);
  assert.equal(writing.selected, null);
  assert.equal(writing.guide.hidden, true);
  assert.equal(writing.ghost.hidden, true);
});

test('trackpad pans and pinch zoom keep released positions and surrounding cloud coordinates anchored', () => {
  const message = Object.freeze({x:6.2,y:0.1});
  const sky = Object.assign(Object.create(SkyView.prototype), {
    w:1000,h:800,centerX:6,centerY:0,zoom:1,drift:[7,11],
  });
  const surface = new EventTarget();
  surface.clientHeight = 800;
  bindZoomInput(surface, {pan:(x,y)=>sky.panBy(x,y),zoom:(f,x,y)=>sky.zoomAt(f,x,y)});
  const initial = sky.toScreen(message.x,message.y);
  const cloud = sky.cloudUV(initial.x,initial.y);
  for (const props of [
    {deltaX:80,deltaY:140,ctrlKey:false},
    {deltaX:0,deltaY:-90,ctrlKey:true},
    {deltaX:-30,deltaY:2000,ctrlKey:false},
  ]) {
    const event = new Event('wheel',{cancelable:true});
    Object.assign(event,{deltaMode:0,clientX:400,clientY:300,...props});
    surface.dispatchEvent(event);
    const position = sky.toScreen(message.x,message.y);
    const texture = sky.cloudUV(position.x,position.y);
    assert.ok(Math.abs(texture.u-cloud.u)<1e-8);
    assert.ok(Math.abs(texture.v-cloud.v)<1e-8);
    assert.deepEqual(message,{x:6.2,y:0.1});
  }
  assert.notDeepEqual(sky.toScreen(message.x,message.y),initial);
});

test('direct double consonants compose as initials and only valid finals', () => {
  for (const [letter, expected] of [['ㄲ','까'],['ㄸ','따'],['ㅃ','빠'],['ㅆ','싸'],['ㅉ','짜']]) {
    assert.equal(blockText([letter, 'ㅏ']), expected);
  }
  assert.equal(blockText(['ㅂ','ㅏ','ㄲ']), '밖');
  assert.equal(blockText(['ㅇ','ㅣ','ㅆ']), '있');
  for (const letter of ['ㄸ','ㅃ','ㅉ']) assert.equal(canAdd(['ㄱ','ㅏ'], letter), false);
});

test('persisted city gains new letters once without refilling spent old letters', () => {
  const old = createSupply({ now: () => 1000 });
  old.reserve('kr-seoul', 'a', 'ㄱ', 'request-old');
  const initial = structuredClone(old.exportState());
  for (const l of ['ㄲ','ㄸ','ㅃ','ㅆ','ㅉ']) delete initial.cities['kr-seoul'].available[l];
  const upgraded = createSupply({ initial, now: () => 1000 });
  assert.equal(upgraded.snapshot('kr-seoul')['ㄱ'], 9);
  assert.equal(upgraded.snapshot('kr-seoul')['ㄲ'], 10);
  const claim = upgraded.reserve('kr-seoul', 'b', 'ㄲ', 'request-new');
  assert.equal(claim.reservation.letter, 'ㄲ');
  const restarted = createSupply({ initial: structuredClone(upgraded.exportState()), now: () => 1000 });
  assert.equal(restarted.snapshot('kr-seoul')['ㄲ'], 9);
});

test('drag beside initial then below syllable builds 간; separate blocks merge and undo without spending twice', () => {
  const c = createComposer();
  const writing = Object.assign(Object.create(Writing.prototype), { composer: c, sky: { unit: 100 } });
  const g = c.drop('ㄱ', 'r1', 5, 0).block;
  const vowelTarget = writing.joinTarget({x: 5 + GLYPH * 0.65, y: 0}, b => c.preview(b.id, 'ㅏ'));
  assert.equal(vowelTarget.id, g.id);
  c.drop('ㅏ', 'r2', 5, 0, vowelTarget.id);
  assert.equal(c.text(g), '가');
  const finalTarget = writing.joinTarget({x: 5, y: GLYPH * 1.05}, b => c.preview(b.id, 'ㄴ'));
  assert.equal(finalTarget.id, g.id);
  const n = c.drop('ㄴ', 'r3', 10, 0).block;
  assert.equal(c.previewMerge(n.id, g.id), '간');
  assert.equal(c.merge(n.id, g.id), true);
  assert.equal(c.blocks.length, 1);
  assert.equal(c.text(c.blocks[0]), '간');
  assert.deepEqual(c.rids(), ['r1','r2','r3']);
  assert.deepEqual(c.undo(), { release: [] });
  assert.equal(c.blocks.length, 2);
  assert.equal(c.text(c.blocks[0]), '가');
  assert.equal(c.text(c.blocks[1]), 'ㄴ');
});

test('trackpad, wheel units and Safari gestures zoom once and leave tray scrolling intact', () => {
  const surface = new EventTarget();
  surface.clientHeight = 800;
  surface.getBoundingClientRect = () => ({ x:0,y:0,width:1000,height:800 });
  const factors = [];
  const pans = [];
  let pointers = false;
  bindZoomInput(surface, { zoom: f => factors.push(f), pan: (x,y) => pans.push([x,y]), pointersActive: () => pointers });
  const send = (type, props = {}) => {
    const e = new Event(type, { cancelable:true });
    Object.assign(e, { deltaMode:0,deltaX:0,deltaY:-20,ctrlKey:true,clientX:300,clientY:200, ...props });
    surface.dispatchEvent(e);
    return e;
  };
  assert.equal(send('wheel').defaultPrevented, true);
  assert.ok(factors[0] > 1.2);
  send('gesturestart', {scale:1});
  send('gesturechange', {scale:1.5});
  send('wheel');
  assert.deepEqual(factors.slice(1), [1.5]);
  pointers = true;
  send('gesturechange', {scale:2});
  assert.equal(factors.length, 2);
  send('gestureend');
  send('wheel', {deltaY:20});
  assert.ok(factors.at(-1) < 1);
  send('wheel', {ctrlKey:false,deltaX:8,deltaY:20});
  assert.deepEqual(pans.at(-1), [-8,-20]);
  assert.equal(wheelZoomFactor({deltaY:1,deltaMode:1}), wheelZoomFactor({deltaY:16,deltaMode:0}));
  surface.closest = () => true;
  assert.equal(send('wheel').defaultPrevented, false);
});

test('empty sky backdrop visibly zooms and keeps altitude projection invertible', () => {
  const sky = Object.assign(Object.create(SkyView.prototype), { zoom:1, w:1000, skyH:800, centerX:5, centerY:0 });
  const before = sky.bgX(6);
  sky.zoom = 4;
  assert.ok(sky.bgX(6) - 500 > before - 500);
  assert.ok(Math.abs(sky.yToAlt(sky.altToY(30)) - 30) < 1e-9);
});
