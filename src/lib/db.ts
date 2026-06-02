import Dexie, { type Table } from 'dexie';

/**
 * Defines the chat examples structure.
 */
export interface ExampleMessage {
  id: string;
  user: string;
  character: string;
}

/**
 * Represents multimedia assets separate from the core profile.
 */
export interface CharacterAsset {
  id: string;
  characterId: string;
  name: string;
  type: 'image' | 'avatar' | 'voice';
  uri: string;
  ext: string;
}

/**
 * Isolated high-res avatar image store.
 */
export interface CharacterImage {
  id: string;
  image: string | null;
}

/**
 * Individual conditional Lorebook entries.
 */
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

/**
 * Local schema container for embedded lorebooks.
 */
export interface CharacterBook {
  name: string;
  description?: string;
  entries: CharacterBookEntry[];
}

/**
 * Core Character profile. Large binary assets are omitted to protect query performance.
 */
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
    thumbnail?: string | null;
    relatedCharacters: string;
    characterBook: CharacterBook;
    worldInfo: string;
  };
}

/**
 * Dexie-based local IndexedDB character manager.
 */
export class CharDB extends Dexie {
  characters!: Table<Character, string>;
  characterImages!: Table<CharacterImage, string>;
  characterAssets!: Table<CharacterAsset, string>;

  constructor() {
    super('CharCreatorDB');

    // Version 1: Initial database store setup
    this.version(1).stores({
      characters: 'id, name, createdAt, updatedAt'
    });

    // Version 2: Schema restructures for lists and old textarea splits
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

    // Version 3: Adds support for base64 main avatars
    this.version(3).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.image === undefined) {
          char.data.image = null;
        }
      });
    });

    // Version 4: Adds support for relative characters associations
    this.version(4).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.relatedCharacters === undefined) {
          char.data.relatedCharacters = '';
        }
      });
    });

    // Version 5: Adds support for raw multimedia asset bundling
    this.version(5).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.assets) {
          char.data.assets = [];
        }
      });
    });

    // Version 6: Adds support for embedded lorebook structures
    this.version(6).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.characterBook) {
          char.data.characterBook = { name: '', description: '', entries: [] };
        }
      });
    });

    // Version 7: Adds support for external standalone world info files
    this.version(7).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.worldInfo === undefined) {
          char.data.worldInfo = '';
        }
      });
    });

    // Version 8: Performance upgrade. Isolates heavy binary streams into distinct table stores.
    this.version(8).stores({
      characters: 'id, name, createdAt, updatedAt',
      characterImages: 'id',
      characterAssets: 'id, characterId'
    }).upgrade(async tx => {
      await tx.table('characters').toCollection().modify((char) => {
        if (char.data.image) {
          tx.table('characterImages').put({ id: char.id, image: char.data.image });
          // @ts-ignore - Cleaning deprecated legacy fields
          delete char.data.image;
        }
        if (char.data.assets && char.data.assets.length > 0) {
          for (const asset of char.data.assets) {
            tx.table('characterAssets').put({ ...asset, characterId: char.id });
          }
          // @ts-ignore - Cleaning deprecated legacy fields
          delete char.data.assets;
        }
        char.data.thumbnail = null;
      });
    });
  }
}

export const db = new CharDB();
