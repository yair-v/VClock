import { useEffect,useState } from 'react';
import { apiGet,apiPost,apiDelete } from '../services/api';

export default function AdminDepartmentsPage(){
  const [deps,setDeps]=useState([]);
  const [name,setName]=useState('');

  async function load(){
    const d = await apiGet('/admin/departments');
    setDeps(d);
  }

  useEffect(()=>{load();},[]);

  async function add(){
    await apiPost('/admin/departments',{name});
    setName('');
    load();
  }

  async function remove(id){
    await apiDelete('/admin/departments/'+id);
    load();
  }

  return (
    <div>
      <h2>מחלקות</h2>
      <input value={name} onChange={e=>setName(e.target.value)} />
      <button onClick={add}>הוסף</button>

      {deps.map(d=>(
        <div key={d.id}>
          {d.name}
          <button onClick={()=>remove(d.id)}>מחק</button>
        </div>
      ))}
    </div>
  );
}
