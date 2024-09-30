import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    const uri = `mongodb://${host}:${port}/${database}`;

    this.client = new MongoClient(uri, { useUnifiedTopology: true });
    this.client.connect().then(() => {
      this.db = this.client.db();
      this.initializeData();
    });
  }

  isAlive() {
    return this.client.isConnected();
  }

  async nbUsers() {
    const usersCollection = this.db.collection('users');
    return usersCollection.countDocuments();
  }

  async nbFiles() {
    const filesCollection = this.db.collection('files');
    return filesCollection.countDocuments();
  }

  async initializeData() {
    const usersCollection = this.db.collection('users');
    const filesCollection = this.db.collection('files');

    // Check if data already exists
    const userCount = await usersCollection.countDocuments();
    const fileCount = await filesCollection.countDocuments();

    if (userCount === 0) {
      // Insert 4 sample users
      await usersCollection.insertMany([
        { name: 'User1' },
        { name: 'User2' },
        { name: 'User3' },
        { name: 'User4' }
      ]);
    }

    if (fileCount === 0) {
      // Insert 30 sample files
      const sampleFiles = Array(30).fill().map((_, index) => ({ name: `File${index + 1}` }));
      await filesCollection.insertMany(sampleFiles);
    }
  }
}

const dbClient = new DBClient();
export default dbClient;
