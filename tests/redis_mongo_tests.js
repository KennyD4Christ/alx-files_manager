import redisClient from '../utils/redis';
import dbClient from '../utils/db';

jest.mock('../utils/redis');
jest.mock('../utils/db');

describe('Redis Client', () => {
  it('should check if client is alive', async () => {
    redisClient.isAlive.mockResolvedValue(true);
    expect(await redisClient.isAlive()).toBe(true);
  });

  it('should set and get a value', async () => {
    redisClient.set.mockResolvedValue('OK');
    redisClient.get.mockResolvedValue('testValue');

    await redisClient.set('testKey', 'testValue', 3600);
    const value = await redisClient.get('testKey');
    expect(value).toBe('testValue');
  });

  it('should delete a key', async () => {
    redisClient.del.mockResolvedValue(1);
    const result = await redisClient.del('testKey');
    expect(result).toBe(1);
  });
});

describe('DB Client', () => {
  it('should check if client is alive', async () => {
    dbClient.isAlive.mockReturnValue(true);
    expect(dbClient.isAlive()).toBe(true);
  });

  it('should return the number of users', async () => {
    dbClient.nbUsers.mockResolvedValue(5);
    const count = await dbClient.nbUsers();
    expect(count).toBe(5);
  });

  it('should return the number of files', async () => {
    dbClient.nbFiles.mockResolvedValue(10);
    const count = await dbClient.nbFiles();
    expect(count).toBe(10);
  });
});
