const express = require("express");
const router = express.Router();
const { authRequired, adminRequired } = require("../services/auth.js");
const Joi = require("joi");
const { db } = require("../services/db.js");

// GET /competitions
router.get("/", authRequired, function (req, res, next) {
    const stmt = db.prepare(`
        SELECT c.id, c.name, c.description, u.name AS author, c.apply_till
        FROM competitions c, users u
        WHERE c.author_id = u.id
        ORDER BY c.apply_till
    `);
    const result = stmt.all();

    res.render("competitions/index", { result: { items: result } });
});

// SCHEMA signup
const schema_id = Joi.object({
    id: Joi.number().integer().positive().required()
});

// GET /competitions/delete/:id
router.get("/delete/:id", adminRequired, function (req, res, next) {
    // do validation
    const result = schema_id.validate(req.params);
    if (result.error) {
        throw new Error("Neispravan poziv");
    }

    const stmt = db.prepare("DELETE FROM applications WHERE competition_id = ?");
    const deleteApplications = stmt.run(req.params.id)

    const stmt2 = db.prepare("DELETE FROM competitions WHERE id = ?;");
    const deleteResult = stmt2.run(req.params.id);

    if (!deleteResult.changes || deleteResult.changes !== 1) {
        throw new Error("Operacija nije uspjela");
    }

    res.redirect("/competitions");
});

// GET /competitions/edit/:id
router.get("/edit/:id", adminRequired, function (req, res, next) {
    // do validation
    const result = schema_id.validate(req.params);
    if (result.error) {
        throw new Error("Neispravan poziv");
    }

    const stmt = db.prepare("SELECT * FROM competitions WHERE id = ?;");
    const selectResult = stmt.get(req.params.id);

    if (!selectResult) {
        throw new Error("Neispravan poziv");
    }

    res.render("competitions/form", { result: { display_form: true, edit: selectResult } });
});

// GET /competitions/add
router.get("/add", adminRequired, function (req, res, next) {
    res.render("competitions/form", { result: { display_form: true } });
});

// SCHEMA add
const schema_add = Joi.object({
    name: Joi.string().min(3).max(50).required(),
    description: Joi.string().min(3).max(1000).required(),
    apply_till: Joi.date().iso().required()
});

// SCHEMA edit
const schema_edit = Joi.object({
    id: Joi.number().integer().positive().required(),
    name: Joi.string().min(3).max(50).required(),
    description: Joi.string().min(3).max(1000).required(),
    apply_till: Joi.date().iso().required()
});

// GET /competitions/edit
router.post("/edit", authRequired, function (req, res, next) {
    const result = schema_edit.validate(req.body);
    if (result.error) {
        res.render("competitions/form", { result: { validation_error: true, display_form: true } });
        return;
    }

    const stmt = db.prepare("UPDATE competitions SET name = ?, description = ?, apply_till = ? WHERE id = ?;")
    const updateResult = stmt.run(req.body.name, req.body.description, req.body.apply_till, req.body.id);

    if (updateResult.changes && updateResult.changes === 1) {
        res.redirect("/competitions");
    } else {
        res.render("competitions/form", { result: { database_error: true } });
    }
});

// POST /competitions/add
router.post("/add", adminRequired, function (req, res, next) {
    // do validation
    const result = schema_add.validate(req.body);
    if (result.error) {
        res.render("competitions/form", { result: { validation_error: true, display_form: true } });
        return;
    }

    const stmt = db.prepare("INSERT INTO competitions (name, description, author_id, apply_till) VALUES (?, ?, ?, ?);");
    const insertResult = stmt.run(req.body.name, req.body.description, req.user.sub, req.body.apply_till);

    if (insertResult.changes && insertResult.changes === 1) {
        res.render("competitions/form", { result: { success: true } });
    } else {
        res.render("competitions/form", { result: { database_error: true } });
    }
});

// GET /competitions/apply/:id
router.get("/apply/:id", function (req, res, next) {
    const result = schema_id.validate(req.params);
    if(result.error) {
        throw new Error("Neispravan poziv");
    }
    const stmt2 = db.prepare("SELECT * FROM applications WHERE user_id = ? AND competition_id = ?");
    const dbResult = stmt2.get(req.user.sub, req.params.id);

    if(dbResult) {
        res.render("competitions/form", {result: {alreadyApplied: true}});
    }
    else {
        const stmt = db.prepare("INSERT INTO applications(user_id, competition_id, applied_at) VALUES (?, ?, ?);");
        const applyResult = stmt.run(req.user.sub, req.params.id, new Date().toISOString());

        const stmt2 = db.prepare("SELECT name FROM competitions WHERE id = ?;");
        const imeUsera = stmt2.get(req.params.id);

        const stmt3 = db.prepare("INSERT INTO inbox(authorID, message, competitionID) VALUES (?, ?, ?);")
        const posliPoruku = stmt3.run(req.user.sub, 'Nova prijava na natjecanje: ' + imeUsera.name, req.params.id);


        if(applyResult.changes && applyResult.changes === 1) {
            res.render("competitions/form", {result: {applied : true}});
        }
        else {
            res.render("competitions/form", {result: {database_error : true}});
        }
    }
});

// GET /competitions/score/:id
router.get("/score/:id", function (req, res, next) {
    const result = schema_id.validate(req.params);
    if (result.error) {
        throw new Error("Neispravan poziv");
    }
    const stmt = db.prepare(`
        SELECT a.id, u.name AS natjecatelj, a.applied_at, a.score, c.name AS natjecanje, a.competition_id
        FROM users u, applications a, competitions c
        WHERE a.user_id = u.id AND a.competition_id = c.id AND c.id = ?
        ORDER BY a.score
    `);
    const dbResult = stmt.all(req.params.id);

    res.render("competitions/score", { result: { items: dbResult } });

});

// POST /competitions/score/:id
router.post("/scoreUpdate/:id", authRequired, function (req, res, next) {
    const result = schema_id.validate(req.params);
    if (result.error) {
        throw new Error("Neispravan poziv");
    }
    const stmt = db.prepare("UPDATE applications SET score = ? WHERE id = ?;")
    const updateResult = stmt.run(req.body.score, req.params.id);

    if (!updateResult) {
        throw new Error("Neispravan poziv");
    }
    res.redirect("/competitions/score/" + req.body.competition_id);
});

//GET /competitions/printLayout/:id
router.get("/printLayout/:id", function (req, res, next) {
    const result = schema_id.validate(req.params);
    if (result.error) {
        throw new Error("Neispravan poziv");
    }
    const stmt = db.prepare(`
        SELECT a.id, u.name AS natjecatelj, c.apply_till, a.score, c.name AS natjecanje, a.competition_id
        FROM users u, applications a, competitions c
        WHERE a.user_id = u.id AND a.competition_id = c.id AND c.id = ?
        ORDER BY a.score DESC
    `);
    const dbResult = stmt.all(req.params.id);
    res.render("competitions/printLayout", {result: {items: dbResult, printLayout: true}})
});

module.exports = router;