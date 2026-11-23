// CTF side quests: types, API calls, and the state shared by the flag box
// (FlagEntry) and the bingo card's "pick a square" mode.

import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";

export interface CtfChallenge {
  id: string;
  title: string;
  hint: string;
  solved: boolean;
}

/** The `ctf` block in GET /api/player. */
export interface CtfState {
  enabled: boolean;         // the host's "Exploits On/Off" button
  challenges: CtfChallenge[];
  credits: number;          // free squares the player can stamp right now
  free_squares: number[];   // card indexes already stamped
  max_free: number;
  debug_token?: string;     // the "Loose lips" challenge's bait; never rendered
}

export interface RedeemResult {
  ok: true;
  challenge: string;
  message: string;
  credits: number;
}

export interface FreeSquareResult {
  marks: number[];
  free_squares: number[];
  credits: number;
}

export type CtfFeedback = { kind: "success" | "error"; text: string } | null;

/** What changed after a redeem or a stamp; merge it with applyCtfPatch. */
export interface CtfPatch {
  credits: number;
  solved?: string;          // challenge id just solved
  marks?: number[];
  free_squares?: number[];
}

type WithCtf = { marks: number[]; ctf?: CtfState };

/** Merge a CtfPatch into the player state so the UI updates before the next poll. */
export function applyCtfPatch<T extends WithCtf | null | undefined>(s: T, p: CtfPatch): T {
  if (!s || !s.ctf) return s;
  return {
    ...s,
    marks: p.marks ?? s.marks,
    ctf: {
      ...s.ctf,
      credits: p.credits,
      free_squares: p.free_squares ?? s.ctf.free_squares,
      challenges: s.ctf.challenges.map((c) => (c.id === p.solved ? { ...c, solved: true } : c)),
    },
  };
}

/**
 * Call once in PlayerGame, before any early return:
 *   const quests = useSideQuests((p) => setState((s) => applyCtfPatch(s, p)));
 */
export function useSideQuests(onUpdate: (patch: CtfPatch) => void) {
  const [picking, setPicking] = useState(false);
  const [feedback, setFeedback] = useState<CtfFeedback>(null);

  // Esc cancels "pick a square" mode.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  async function redeem(flag: string): Promise<RedeemResult | null> {
    try {
      const r = await api<RedeemResult>("/player/flag", { method: "POST", body: { flag } });
      onUpdate({ credits: r.credits, solved: r.challenge });
      setFeedback({ kind: "success", text: r.message });
      if (r.credits > 0) setPicking(true);
      return r;
    } catch (e) {
      setFeedback({ kind: "error", text: errorMessage(e) });
      return null;
    }
  }

  async function stamp(index: number): Promise<void> {
    try {
      const r = await api<FreeSquareResult>("/player/free-square", { method: "POST", body: { index } });
      onUpdate(r);
      setFeedback({ kind: "success", text: "Free square stamped. It now counts as called." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorMessage(e) });
    } finally {
      setPicking(false);
    }
  }

  return { picking, setPicking, feedback, setFeedback, redeem, stamp };
}

export type SideQuests = ReturnType<typeof useSideQuests>;
