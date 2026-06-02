import Dexie, { type Table } from 'dexie';

export interface ExampleMessage {
  id: string;
  user: string;
  character: string;
}

export interface CharacterAsset {
  id: string;
  characterId: string;
  name: string;
  type: 'image' | 'avatar' | 'voice';
  uri: string;
  ext: string;
}

export interface CharacterImage {
  id: string;
  image: string | null;
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
    thumbnail?: string | null;
    relatedCharacters: string;
    characterBook: CharacterBook;
    worldInfo: string;
  };
}

export class CharDB extends Dexie {
  characters!: Table<Character, string>;
  characterImages!: Table<CharacterImage, string>;
  characterAssets!: Table<CharacterAsset, string>;

  constructor() {
    super('CharCreatorDB');

    this.version(1).stores({
      characters: 'id, name, createdAt, updatedAt'
    });

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

    this.version(3).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.image === undefined) {
          char.data.image = null;
        }
      });
    });

    this.version(4).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.relatedCharacters === undefined) {
          char.data.relatedCharacters = '';
        }
      });
    });

    this.version(5).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.assets) {
          char.data.assets = [];
        }
      });
    });

    this.version(6).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (!char.data.characterBook) {
          char.data.characterBook = { name: '', description: '', entries: [] };
        }
      });
    });

    this.version(7).stores({
      characters: 'id, name, createdAt, updatedAt'
    }).upgrade(tx => {
      return tx.table('characters').toCollection().modify(char => {
        if (char.data.worldInfo === undefined) {
          char.data.worldInfo = '';
        }
      });
    });

    // Version 8: Separates all binary data into isolated table stores to resolve toArray() lag.
    this.version(8).stores({
      characters: 'id, name, createdAt, updatedAt',
      characterImages: 'id',
      characterAssets: 'id, characterId'
    }).upgrade(async tx => {
      await tx.table('characters').toCollection().modify((char) => {
        if (char.data.image) {
          tx.table('characterImages').put({ id: char.id, image: char.data.image });
          // @ts-ignore - Removing old legacy binary fields
          delete char.data.image;
        }
        if (char.data.assets && char.data.assets.length > 0) {
          for (const asset of char.data.assets) {
            tx.table('characterAssets').put({ ...asset, characterId: char.id });
          }
          // @ts-ignore - Removing old legacy binary fields
          delete char.data.assets;
        }
        char.data.thumbnail = null;
      });
    });
  }
}

export const db = new CharDB();
