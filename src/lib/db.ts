import Dexie, { type Table } from 'dexie';

export interface ExampleMessage {
  id: string;
  user: string;
  character: string;
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
        // Migrate First Message to First Messages Array
        if (char.data.firstMessage !== undefined) {
          char.data.firstMessages = [char.data.firstMessage];
          delete char.data.firstMessage;
        } else if (!char.data.firstMessages) {
          char.data.firstMessages = [''];
        }

        // Migrate Example Messages
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

        // Flatten old description object to Main Description + Subfield Backstory
        if (typeof char.data.description === 'object') {
          const oldDesc = char.data.description;
          char.data.backstory = oldDesc.backstory || '';
          char.data.description = [oldDesc.general, oldDesc.appearance].filter(Boolean).join('\n\n');
        }
      });
    });
  }
}

export const db = new CharDB();
