import Dexie, { type Table } from 'dexie';

export interface ExampleMessage {
  id: string;
  user: string;
  character: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  type: 'image' | 'avatar' | 'voice';
  uri: string;
  ext: string;
}

export interface CharacterBookEntry {
  id: string;
  keys: string[];
  secondary_keys?: string[];
  content: string;
  enabled: boolean;
  priority?: number;
  comment?: string;
  constant?: boolean;
}

export interface CharacterBook {
  name: string;
  description?: string;
  entries: CharacterBookEntry[];
}

export interface Character {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  data: {
    mainPrompt: string;
    description: string;
    personality: string;
    scenario: string;
    backstory: string;
    firstMessages: string[];
    exampleMessages: ExampleMessage[];
    image?: string | null;
    relatedCharacters: string;
    assets: CharacterAsset[];
    characterBook: CharacterBook;
  };
}

export class CharDB extends Dexie {
  characters!: Table<Character, string>;

  constructor() {
    super('CharCreatorDB');

    this.version(1).stores({
      characters: 'id, name, createdAt, updatedAt'
    });

    // Version 2: Restructured data schema
    this.version(2).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.firstMessage !== undefined) {
          char.data.firstMessages = [char.data.firstMessage];
          delete char.data.firstMessage;
        } else if (!char.data.firstMessages) {
          char.data.firstMessages = [''];
        }

        if (char.data.dialogueExamples !== undefined) {
          char.data.exampleMessages = [{
            id: crypto.randomUUID(),
            user: '',
            character: char.data.dialogueExamples
          }];
          delete char.data.dialogueExamples;
        } else if (!char.data.exampleMessages) {
          char.data.exampleMessages = [];
        }

        if (typeof char.data.description === 'object') {
          const oldDesc = char.data.description;
          char.data.backstory = oldDesc.backstory || '';
          char.data.description = [oldDesc.general, oldDesc.appearance].filter(Boolean).join('\n\n');
        }
      });
    });

    // Version 3: Adds character avatar support
    this.version(3).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.image === undefined) {
          char.data.image = null;
        }
      });
    });

    // Version 4: Adds support for other related characters
    this.version(4).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.relatedCharacters === undefined) {
          char.data.relatedCharacters = '';
        }
      });
    });

    // Version 5: Adds support for character assets list
    this.version(5).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.assets) {
          char.data.assets = [];
        }
      });
    });

    // Version 6: Adds support for character book (lorebook)
    this.version(6).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.characterBook) {
          char.data.characterBook = {
            name: '',
            description: '',
            entries: []
          };
        }
      });
    });
  }
}

export const db = new CharDB();
