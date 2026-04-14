const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/', async (req,res)=>{
  const r = await query('SELECT * FROM departments ORDER BY name');
  res.json(r.rows);
});

router.post('/', async (req,res)=>{
  const {name} = req.body;
  await query('INSERT INTO departments (name) VALUES ($1)',[name]);
  res.json({success:true});
});

router.delete('/:id', async (req,res)=>{
  await query('DELETE FROM departments WHERE id=$1',[req.params.id]);
  res.json({success:true});
});

module.exports = router;
