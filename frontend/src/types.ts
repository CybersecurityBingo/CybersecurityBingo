// Shapes of the JSON the Flask backend (backend/app.py) sends back.

export interface CalledQuestion {
  n: number;
  question: string;
  at: number; // Unix seconds
  term?: string; // only in the admin view (the answer)
}

export interface PlayerState {
  name: string;
  card: string[]; // 25 terms, index 12 is "FREE"
  marks: number[];
  checksum: string;
  won: boolean;
  called: CalledQuestion[];
  winners: string[];
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

export interface AdminState {
  game_id: string;
  bank: BankQuestion[];
  called: CalledQuestion[];
  players: { name: string; marks: number; won: boolean; checksum: string }[];
  claims: { name: string; valid: boolean; line: number[] | null; at: number }[];
  winners: string[];
}
