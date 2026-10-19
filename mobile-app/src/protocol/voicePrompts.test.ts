import { test } from "node:test";
import assert from "node:assert/strict";
import { NavigationDirection } from "./navigationProtocol";
import {
  navigationVoicePrompt,
  potholeVoicePrompt,
  incomingCallVoicePrompt,
  crashVoicePrompt,
  announceNavigation,
  announcePothole,
  announceIncomingCall,
  announceCrash,
  SpeechEngine,
} from "./voicePrompts";

function recordingSpeech(): { engine: SpeechEngine; spoken: string[] } {
  const spoken: string[] = [];
  return { engine: { speak: (t: string) => { spoken.push(t); } }, spoken };
}

test("navigationVoicePrompt: covers every direction with a sane phrase", () => {
  assert.match(navigationVoicePrompt(NavigationDirection.LEFT, 100), /left/i);
  assert.match(navigationVoicePrompt(NavigationDirection.RIGHT, 100), /right/i);
  assert.match(navigationVoicePrompt(NavigationDirection.STRAIGHT, 100), /straight/i);
  assert.match(navigationVoicePrompt(NavigationDirection.U_TURN, 100), /u-turn/i);
  assert.match(navigationVoicePrompt(NavigationDirection.DESTINATION, 100), /destination/i);
});

test("navigationVoicePrompt: clamps a negative distance to 0", () => {
  assert.match(navigationVoicePrompt(NavigationDirection.STRAIGHT, -5), /\b0\b/);
});

test("potholeVoicePrompt: covers every avoidance direction", () => {
  assert.match(potholeVoicePrompt("LEFT"), /left/i);
  assert.match(potholeVoicePrompt("RIGHT"), /right/i);
  assert.match(potholeVoicePrompt("CENTER"), /center/i);
});

test("incomingCallVoicePrompt: includes the caller name when given", () => {
  assert.match(incomingCallVoicePrompt("Priya"), /Priya/);
});

test("incomingCallVoicePrompt: falls back gracefully for blank/whitespace names", () => {
  assert.doesNotMatch(incomingCallVoicePrompt("   "), /\s{2,}/);
  assert.match(incomingCallVoicePrompt(""), /incoming call/i);
});

test("crashVoicePrompt: mentions the countdown length", () => {
  assert.match(crashVoicePrompt(10), /10 seconds/);
});

test("crashVoicePrompt: rounds and floors a fractional/negative countdown", () => {
  assert.match(crashVoicePrompt(9.6), /10 seconds/);
  assert.match(crashVoicePrompt(-3), /0 seconds/);
});

test("announceNavigation/announcePothole/announceIncomingCall/announceCrash call speak() once", () => {
  {
    const { engine, spoken } = recordingSpeech();
    announceNavigation(engine, NavigationDirection.LEFT, 50);
    assert.equal(spoken.length, 1);
  }
  {
    const { engine, spoken } = recordingSpeech();
    announcePothole(engine, "RIGHT");
    assert.equal(spoken.length, 1);
  }
  {
    const { engine, spoken } = recordingSpeech();
    announceIncomingCall(engine, "Alex");
    assert.equal(spoken.length, 1 );
    assert.match(spoken[0], /Alex/);
  }
  {
    const { engine, spoken } = recordingSpeech();
    announceCrash(engine);
    assert.equal(spoken.length, 1);
    assert.match(spoken[0], /crash detected/i);
  }
});
