const express = require("express");

const fs = require("fs");

const app = express();

const PORT = 3000;

app.use(express.json({limit:"50mb"}));
app.use(express.static("public"));

const FILE = "emails.txt";
const QUESTIONS_FILE = "questions.json";
const SECTIONS_FILE = "sections.json";
const CONFIG_FILE = "config.json";

/* Admin password — change this value to update the admin login password */
const ADMIN_PASSWORD = "2026";

/* ======================== */
/* HELPERS */
/* ======================== */

function readJSON(file, defaultData){
    if(!fs.existsSync(file)){
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch(e){
        return defaultData;
    }
}

function writeJSON(file, data){
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ======================== */
/* CONFIG API */
/* ======================== */

app.get("/api/config", (req, res) => {
    const config = readJSON(CONFIG_FILE, {examDuration: 5400});
    res.json(config);
});

app.put("/api/config", (req, res) => {
    const current = readJSON(CONFIG_FILE, {examDuration: 5400});
    const updated = {...current, ...req.body};
    writeJSON(CONFIG_FILE, updated);
    res.json({success: true, config: updated});
});

/* ======================== */
/* SECTIONS API */
/* ======================== */

app.get("/api/sections", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    data.sections.sort((a,b) => a.order - b.order);
    res.json(data.sections);
});

app.post("/api/sections", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const {name} = req.body;
    if(!name || !name.trim()){
        return res.status(400).json({error: "Section name is required"});
    }
    const maxId = data.sections.reduce((m, s) => Math.max(m, s.id), 0);
    const maxOrder = data.sections.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const section = {id: maxId + 1, name: name.trim(), order: maxOrder + 1};
    data.sections.push(section);
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true, section});
});

app.put("/api/sections/reorder", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const {orderedIds} = req.body;
    if(!Array.isArray(orderedIds)) return res.status(400).json({error: "orderedIds array required"});
    data.sections.forEach(s => {
        const idx = orderedIds.indexOf(s.id);
        if(idx !== -1) s.order = idx + 1;
    });
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true});
});

app.put("/api/sections/:id", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const id = parseInt(req.params.id);
    const index = data.sections.findIndex(s => s.id === id);
    if(index === -1) return res.status(404).json({error: "Section not found"});
    data.sections[index] = {...data.sections[index], ...req.body, id};
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true, section: data.sections[index]});
});

app.delete("/api/sections/:id", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const id = parseInt(req.params.id);
    data.sections = data.sections.filter(s => s.id !== id);
    writeJSON(SECTIONS_FILE, data);
    const qData = readJSON(QUESTIONS_FILE, {questions: []});
    qData.questions = qData.questions.map(q => 
        q.sectionId === id ? {...q, sectionId: null} : q
    );
    writeJSON(QUESTIONS_FILE, qData);
    res.json({success: true});
});

/* ======================== */
/* QUESTIONS API */
/* ======================== */

app.get("/api/questions", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const {sectionId} = req.query;
    let result = data.questions;
    if(sectionId) {
        result = result.filter(q => q.sectionId === parseInt(sectionId));
    }
    res.json(result);
});

/* ADD QUESTION */app.post("/api/questions", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const q = req.body;
    const maxId = data.questions.reduce((max, item) => Math.max(max, item.id), 0);
    q.id = maxId + 1;
    data.questions.push(q);
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, question: q});
});

app.put("/api/questions/:id", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const id = parseInt(req.params.id);
    const index = data.questions.findIndex(q => q.id === id);
    if(index === -1) return res.status(404).json({error: "Question not found"});
    data.questions[index] = {...req.body, id};
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, question: data.questions[index]});
});

app.delete("/api/questions/:id", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const id = parseInt(req.params.id);
    data.questions = data.questions.filter(q => q.id !== id);
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true});
});

/* BULK IMPORT */

app.post("/api/questions/bulk", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const {questions} = req.body;
    if(!Array.isArray(questions)) return res.status(400).json({error: "questions array required"});
    let maxId = data.questions.reduce((max, item) => Math.max(max, item.id), 0);
    let imported = 0;
    questions.forEach(q => {
        if(!q.question) return;
        maxId++;
        data.questions.push({...q, id: maxId});
        imported++;
    });
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, imported});
});

/* CHECK EMAIL */

app.post("/check-email", (req, res) => {
    const email = req.body.email;
    if(!fs.existsSync(FILE)) fs.writeFileSync(FILE, "");
    const data = fs.readFileSync(FILE, "utf8");
    const exists = data.includes(email);
    res.json({exists});
});

app.post("/save-result", (req, res) => {
    const result = req.body;
    const line = `\nEMAIL : ${result.email}\nSCORE : ${result.score}\nPERCENTAGE : ${result.percentage}%\nTIME : ${result.timeTaken}\n--------------------------------\n`;
    fs.appendFileSync(FILE, line);
    console.log("NEW SUBMISSION:\n" + line);
    res.json({success: true});
});

/* GET /api/results — parse emails.txt into structured JSON */

app.get("/api/results", (req, res) => {
    if(!fs.existsSync(FILE)){
        return res.json([]);
    }
    const data = fs.readFileSync(FILE, "utf8");
    const blocks = data.split("--------------------------------").filter(b => b.trim());
    const results = blocks.map(block => {
        const lines = block.trim().split("\n").map(l => l.trim());
        const emailLine = lines.find(l => l.startsWith("EMAIL :"));
        const scoreLine = lines.find(l => l.startsWith("SCORE :"));
        const pctLine = lines.find(l => l.startsWith("PERCENTAGE :"));
        const timeLine = lines.find(l => l.startsWith("TIME :"));
        if(!emailLine) return null;
        return {
            email: emailLine.replace("EMAIL :", "").trim(),
            score: scoreLine ? scoreLine.replace("SCORE :", "").trim() : "",
            percentage: pctLine ? pctLine.replace("PERCENTAGE :", "").trim() : "",
            time: timeLine ? timeLine.replace("TIME :", "").trim() : ""
        };
    }).filter(r => r !== null);
    res.json(results);
});

/* DELETE /api/results/:email — remove all submissions for a given email */

app.delete("/api/results/:email", (req, res) => {
    const emailToRemove = req.params.email.toLowerCase().trim();
    if(!fs.existsSync(FILE)){
        return res.json({success: true, removed: 0});
    }
    const data = fs.readFileSync(FILE, "utf8");
    const blocks = data.split("--------------------------------").filter(b => b.trim());
    const remaining = blocks.filter(block => {
        const emailLine = block.split("\n").find(l => l.trim().toLowerCase().startsWith("email :"));
        if(!emailLine) return true;
        const email = emailLine.replace(/EMAIL :/i, "").trim().toLowerCase();
        return email !== emailToRemove;
    });
    const removedCount = blocks.length - remaining.length;
    if(remaining.length > 0){
        fs.writeFileSync(FILE, "\n\n" + remaining.join("\n\n--------------------------------\n\n") + "\n\n--------------------------------\n");
    } else {
        fs.writeFileSync(FILE, "");
    }
    res.json({success: true, removed: removedCount});
});

/* Admin password API — needed by the admin panel for login */

app.get("/api/admin-password", (req, res) => {
    res.json({password: ADMIN_PASSWORD});
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
});