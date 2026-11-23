// Shapes of the JSON the Flask backend (backend/app.py) sends back.
import type { CtfState } from "./ctf";

export interface CalledQuestion {
  n: number;
  question: string;
  at: number; // Unix seconds
  term?: string; // only in the admin view (the answer)
}

export interface PlayerState {
  name: string;
  card: string[]; // 25 terms, index 12 is "FREE"
  card_id: string;
  marks: number[];
  won: boolean;
  called: CalledQuestion[];
  winners: string[];
  ctf?: CtfState;
}

export interface BingoClaim {
  valid: boolean;
  message: string;
  line?: number[];
}

export interface BankQuestion {
  term: string;
  question: string;
  called: boolean;
}

export interface AdminPlayer {
  id: string; // Firebase user id: with the game id, enough to rebuild the card
  name: string;
  card: string[];
  card_id: string;
  marks: number[];
  line: number[] | null; // a complete marked+called line, claimed or not
  won: boolean;
  free_squares?: number[]; 
}

export interface ExploitAttempt {
  name: string;
  email: string;
  payload: string;
  ip: string;
  at: number;
}

export interface AdminState {
  exploit_enabled: boolean;
  game_id: string;
  bank: BankQuestion[];
  called: CalledQuestion[];
  players: AdminPlayer[];
  claims: { name: string; valid: boolean; line: number[] | null; at: number; ctf_squares?: number[] }[];
  winners: string[];
}
