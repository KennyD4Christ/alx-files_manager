import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import app from '../server';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

jest.mock('../utils/db');
jest.mock('../utils/redis');
jest.mock('uuid');

describe('API Endpoints', () => {
  describe('GET /status', () => {
    it('should return the status of Redis and DB clients', async () => {
      redisClient.isAlive.mockReturnValue(true);
      dbClient.isAlive.mockReturnValue(true);

      const res = await request(app).get('/status');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ redis: true, db: true });
    });
  });

  describe('GET /stats', () => {
    it('should return the number of users and files', async () => {
      dbClient.nbUsers.mockResolvedValue(5);
      dbClient.nbFiles.mockResolvedValue(10);

      const res = await request(app).get('/stats');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ users: 5, files: 10 });
    });
  });

  describe('POST /users', () => {
    it('should create a new user', async () => {
      const mockUser = { email: 'test@example.com', password: 'password123' };
      dbClient.db.collection().findOne.mockResolvedValue(null);
      dbClient.db.collection().insertOne.mockResolvedValue({ insertedId: new ObjectId('123456789012') });

      const res = await request(app)
        .post('/users')
        .send(mockUser);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('email', mockUser.email);
    });

    it('should return error if email is missing', async () => {
      const res = await request(app)
        .post('/users')
        .send({ password: 'password123' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Missing email' });
    });

    it('should return error if password is missing', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'test@example.com' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Missing password' });
    });

    it('should return error if user already exists', async () => {
      dbClient.db.collection().findOne.mockResolvedValue({ email: 'test@example.com' });
      const res = await request(app)
        .post('/users')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Already exist' });
    });
  });

  describe('GET /connect', () => {
    it('should authenticate a user and return a token', async () => {
      const mockUser = { _id: new ObjectId('123456789012'), email: 'test@example.com', password: 'hashed_password' };
      dbClient.db.collection().findOne.mockResolvedValue(mockUser);
      const mockToken = 'mock-token';
      uuidv4.mockReturnValue(mockToken);

      const res = await request(app)
        .get('/connect')
        .auth('test@example.com', 'password123');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ token: mockToken });
    });

    it('should return error for invalid credentials', async () => {
      dbClient.db.collection().findOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/connect')
        .auth('wrong@example.com', 'wrongpassword');
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('GET /disconnect', () => {
    it('should disconnect a user', async () => {
      const mockToken = 'mock-token';
      redisClient.get.mockResolvedValue('user-id');
      redisClient.del.mockResolvedValue(1);

      const res = await request(app)
        .get('/disconnect')
        .set('X-Token', mockToken);
      expect(res.statusCode).toBe(204);
    });

    it('should return error for invalid token', async () => {
      redisClient.get.mockResolvedValue(null);

      const res = await request(app)
        .get('/disconnect')
        .set('X-Token', 'invalid-token');
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('GET /users/me', () => {
    it('should return the current user', async () => {
      const mockUser = { _id: new ObjectId('123456789012'), email: 'test@example.com' };
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/users/me')
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ id: mockUser._id.toString(), email: mockUser.email });
    });

    it('should return error for invalid token', async () => {
      redisClient.get.mockResolvedValue(null);

      const res = await request(app)
        .get('/users/me')
        .set('X-Token', 'invalid-token');
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('POST /files', () => {
    it('should upload a file', async () => {
      const mockUser = { _id: new ObjectId('123456789012') };
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: mockUser._id,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        parentId: '0'
      };
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().insertOne.mockResolvedValue({ insertedId: mockFile._id });

      const res = await request(app)
        .post('/files')
        .set('X-Token', 'mock-token')
        .send({
          name: 'test.txt',
          type: 'file',
          data: 'SGVsbG8gV29ybGQ=',  // Base64 encoded "Hello World"
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        id: mockFile._id.toString(),
        userId: mockUser._id.toString(),
        name: mockFile.name,
        type: mockFile.type,
        isPublic: mockFile.isPublic,
        parentId: mockFile.parentId,
      });
    });

    it('should return error for invalid token', async () => {
      redisClient.get.mockResolvedValue(null);

      const res = await request(app)
        .post('/files')
        .set('X-Token', 'invalid-token')
        .send({
          name: 'test.txt',
          type: 'file',
          data: 'SGVsbG8gV29ybGQ=',
        });
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    // Add more tests for different file types, invalid inputs, etc.
  });

  describe('GET /files/:id', () => {
    it('should return a file by id', async () => {
      const mockUser = { _id: new ObjectId('123456789012') };
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: mockUser._id,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        parentId: '0'
      };
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().findOne.mockResolvedValue(mockFile);

      const res = await request(app)
        .get(`/files/${mockFile._id}`)
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject(mockFile);
    });

    it('should return error for non-existent file', async () => {
      redisClient.get.mockResolvedValue('user-id');
      dbClient.db.collection().findOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/files/nonexistent')
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('GET /files', () => {
    it('should return paginated list of files', async () => {
      const mockUser = { _id: new ObjectId('123456789012') };
      const mockFiles = [
        { _id: new ObjectId('123456789013'), name: 'file1.txt' },
        { _id: new ObjectId('123456789014'), name: 'file2.txt' },
      ];
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockFiles),
      });

      const res = await request(app)
        .get('/files')
        .query({ parentId: '0', page: 0 })
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockFiles);
    });

    it('should return error for invalid token', async () => {
      redisClient.get.mockResolvedValue(null);

      const res = await request(app)
        .get('/files')
        .set('X-Token', 'invalid-token');
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('PUT /files/:id/publish', () => {
    it('should publish a file', async () => {
      const mockUser = { _id: new ObjectId('123456789012') };
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: mockUser._id,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
      };
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().findOneAndUpdate.mockResolvedValue({ value: { ...mockFile, isPublic: true } });

      const res = await request(app)
        .put(`/files/${mockFile._id}/publish`)
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ...mockFile, isPublic: true });
    });

    it('should return error for non-existent file', async () => {
      redisClient.get.mockResolvedValue('user-id');
      dbClient.db.collection().findOneAndUpdate.mockResolvedValue({ value: null });

      const res = await request(app)
        .put('/files/nonexistent/publish')
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('PUT /files/:id/unpublish', () => {
    it('should unpublish a file', async () => {
      const mockUser = { _id: new ObjectId('123456789012') };
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: mockUser._id,
        name: 'test.txt',
        type: 'file',
        isPublic: true,
      };
      redisClient.get.mockResolvedValue(mockUser._id.toString());
      dbClient.db.collection().findOneAndUpdate.mockResolvedValue({ value: { ...mockFile, isPublic: false } });

      const res = await request(app)
        .put(`/files/${mockFile._id}/unpublish`)
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ...mockFile, isPublic: false });
    });

    it('should return error for non-existent file', async () => {
      redisClient.get.mockResolvedValue('user-id');
      dbClient.db.collection().findOneAndUpdate.mockResolvedValue({ value: null });

      const res = await request(app)
        .put('/files/nonexistent/unpublish')
        .set('X-Token', 'mock-token');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('GET /files/:id/data', () => {
    it('should return file data for public file', async () => {
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: new ObjectId('123456789012'),
        name: 'test.txt',
        type: 'file',
        isPublic: true,
        localPath: '/path/to/file',
      };
      dbClient.db.collection().findOne.mockResolvedValue(mockFile);

      const res = await request(app)
        .get(`/files/${mockFile._id}/data`);
      expect(res.statusCode).toBe(200);
      // You might want to mock fs.createReadStream and check for correct file serving
    });

    it('should return error for non-public file without auth', async () => {
      const mockFile = { 
        _id: new ObjectId('123456789013'),
        userId: new ObjectId('123456789012'),
        name: 'test.txt',
        type: 'file',
        isPublic: false,
      };
      dbClient.db.collection().findOne.mockResolvedValue(mockFile);

      const res = await request(app)
        .get(`/files/${mockFile._id}/data`);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });

    it('should return file data for non-public file with auth', async () => {
      const mock
