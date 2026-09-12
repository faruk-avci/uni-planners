#!/usr/bin/env node
/**
 * Rename a course code across every table that references it -- for when the
 * catalog scrape used the wrong subject/number for a course (e.g. a course
 * briefly showed up as "CS304" but its real SIS code is "EE311").
 *
 * catalog_sections has an ON DELETE CASCADE foreign key to
 * catalog_courses.course_code with no ON UPDATE CASCADE, so renaming the
 * parent key in place would fail with dependent rows still pointing at the
 * old code. Instead: copy the catalog_courses row to the new code, repoint
 * every referencing table, then delete the old row.
 *
 * Does NOT touch saved_baskets/shared_schedules JSONB snapshots -- those are
 * historical records of what was generated/shared at the time and are left
 * as-is on purpose.
 *
 * Usage:
 *   node rename_course_code.js --from CS304 --to EE311
 */
import pg from 'pg'
import { getDbConfig } from './db.js'

const { Client } = pg

function parseArgs() {
  const args = process.argv.slice(2)
  const config = { from: '', to: '' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') config.from = (args[++i] || '').trim().toUpperCase()
    else if (args[i] === '--to') config.to = (args[++i] || '').trim().toUpperCase()
    else throw new Error(`Unknown option: ${args[i]}`)
  }
  return config
}

function splitCode(code) {
  const m = code.match(/^([A-Z]+)(\d+.*)$/)
  if (!m) throw new Error(`Could not split "${code}" into subject + course number`)
  return { subject: m[1], course_no: m[2] }
}

async function run() {
  const { from, to } = parseArgs()
  if (!from || !to) {
    console.error('Usage: node rename_course_code.js --from CS304 --to EE311')
    process.exit(1)
  }
  if (from === to) {
    console.error('--from and --to are the same code, nothing to do')
    process.exit(1)
  }
  const { subject, course_no } = splitCode(to)

  const client = new Client(getDbConfig())
  try {
    await client.connect()
    console.log(`Connected to PostgreSQL (${getDbConfig().database}).`)

    const { rows: existing } = await client.query('SELECT course_code FROM catalog_courses WHERE course_code = $1', [from])
    if (existing.length === 0) {
      console.error(`No course found with code ${from} in catalog_courses.`)
      process.exit(1)
    }
    const { rows: collision } = await client.query('SELECT course_code FROM catalog_courses WHERE course_code = $1', [to])
    if (collision.length > 0) {
      console.error(`${to} already exists in catalog_courses -- refusing to overwrite. This needs a manual merge, not a rename.`)
      process.exit(1)
    }

    await client.query('BEGIN')

    await client.query(`
      INSERT INTO catalog_courses (
        course_code, subject, course_no, title, faculty, credits,
        description, corequisites, prerequisites, required_programs, elective_programs
      )
      SELECT $1, $2, $3, title, faculty, credits,
        description, corequisites, prerequisites, required_programs, elective_programs
      FROM catalog_courses WHERE course_code = $4
    `, [to, subject, course_no, from])

    const { rowCount: sectionsMoved } = await client.query(
      'UPDATE catalog_sections SET course_code = $1 WHERE course_code = $2', [to, from]
    )
    const { rowCount: assessmentsMoved } = await client.query(
      'UPDATE course_assessments SET course_code = $1 WHERE course_code = $2', [to, from]
    )
    const { rowCount: basketsMoved } = await client.query(
      'UPDATE basket_items SET course_code = $1 WHERE course_code = $2', [to, from]
    )
    const { rowCount: eventsMoved } = await client.query(
      'UPDATE course_add_events SET course_code = $1 WHERE course_code = $2', [to, from]
    )
    await client.query('DELETE FROM catalog_courses WHERE course_code = $1', [from])

    await client.query('COMMIT')
    console.log(`Renamed ${from} -> ${to}.`)
    console.log(`  catalog_sections:   ${sectionsMoved}`)
    console.log(`  course_assessments: ${assessmentsMoved}`)
    console.log(`  basket_items:       ${basketsMoved}`)
    console.log(`  course_add_events:  ${eventsMoved}`)

    const spaced = from.replace(/^([A-Z]+)(\d+.*)$/, '$1 $2')
    const { rows: dangling } = await client.query(
      `SELECT course_code, prerequisites, corequisites FROM catalog_courses
       WHERE prerequisites ILIKE $1 OR prerequisites ILIKE $2 OR corequisites ILIKE $1 OR corequisites ILIKE $2`,
      [`%${from}%`, `%${spaced}%`]
    )
    if (dangling.length > 0) {
      console.log(`\nNote: these courses still mention "${from}" in prereq/coreq text and were NOT changed -- check manually:`)
      for (const row of dangling) console.log(`  ${row.course_code}: prereq="${row.prerequisites}" coreq="${row.corequisites}"`)
    }
  } catch (err) {
    console.error('Database operation failed:', err.message)
    try { await client.query('ROLLBACK') } catch { /* connection may already be gone */ }
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

run()
