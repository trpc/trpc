import express from 'express';
import { fruits } from '../models/fruit.js';
import {  Request, Response } from 'express';

const router = express.Router();

// 全てのフルーツを取得
router.get('/', (req, res) => {
  res.json(fruits);
});

// 特定のフルーツをIDで取得
router.get('/:id', (req: Request, res: Response) => {
  const fruitId = parseInt(req.params.id);
  const fruit = fruits.find(f => f.id === fruitId);
  
  if (!fruit) {
    return res.status(404).json({ message: '指定されたフルーツが見つかりません' });
  }
  
  res.json(fruit);
});

export default router;