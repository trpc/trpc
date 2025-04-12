import express from 'express';
import { fruits } from '../models/fruit.js';
import type { Request, Response } from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(fruits);
});

// Retrieve specific fruit by ID 
router.get('/:id', (req: Request, res: Response) => {
  const fruitId = parseInt(req.params.id);
  const fruit = fruits.find(f => f.id === fruitId);
  
  if (!fruit) {
    return res.status(404).json({ message: 'Specified fruit not found' });
  }
  
  res.json(fruit);
});

export default router;