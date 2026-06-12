# Synthetic fixtures

Files in this directory are independently constructed test data. They do not
contain records copied from production schedules, directories, imports, or
database exports.

- `schedule.synthetic.json` is the default local seed input. Running
  `npm run db:seed` writes to the configured database.
- `teachers.synthetic.txt` is used by parser tests only.

Real schedule and directory data must remain outside the repository.
