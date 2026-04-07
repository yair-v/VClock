const API = "";

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(API + "/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    alert("Login failed");
    return;
  }

  const data = await res.json();
  window.currentUser = data.user;

  document.getElementById("loginBox").style.display = "none";
  document.getElementById("mainBox").style.display = "block";

  loadAttendance();
}

async function loadAttendance() {
  const res = await fetch(API + "/attendance");
  const data = await res.json();

  const table = document.getElementById("attendanceTable");
  table.innerHTML = "";

  data.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.username}</td>
      <td>${row.type}</td>
      <td>${new Date(row.created_at).toLocaleString()}</td>
    `;

    table.appendChild(tr);
  });
}

async function punch(type) {
  await fetch(API + "/attendance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: window.currentUser.id,
      type,
    }),
  });

  loadAttendance();
}