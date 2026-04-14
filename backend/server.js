const express = require('express');
const app = express();
app.set('trust proxy', true);
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { query, initDb } = require('./db');
const departmentsRoutes = require('./routes/departments');

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || '123456';

function authRequired(req,res,next){
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'no auth'});
  try{ req.user = jwt.verify(token,JWT_SECRET); next(); }
  catch{ res.status(401).json({error:'bad token'}); }
}

function adminRequired(req,res,next){
  if(req.user.role!=='admin') return res.status(403).json({error:'forbidden'});
  next();
}

app.use('/api/admin/departments', authRequired, adminRequired, departmentsRoutes);

app.get('/api/admin/users', authRequired, adminRequired, async (req,res)=>{
  const r = await query(`SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id`);
  res.json(r.rows);
});

app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));

initDb();
const PORT = process.env.PORT||3000;
app.listen(PORT,'0.0.0.0',()=>console.log('Server running '+PORT));
