import fs from 'fs';

const dump = JSON.parse(fs.readFileSync('e:\\ssdssc\\the-summons\\scratch\\db_dump.json', 'utf-8'));

const keywords = ['Isipathana', 'Bandaranayake', 'Visakha', 'Eheliyagoda', 'Gothami', 'Mahinda', 'senanayake', 'Royal College'];

const foundInRegs = new Set<string>();
const foundInMembers = new Set<string>();

dump.registrations.forEach((r: any) => {
  const str = JSON.stringify(r).toLowerCase();
  keywords.forEach(k => {
    if (str.includes(k.toLowerCase())) foundInRegs.add(k);
  });
});

dump.members.forEach((m: any) => {
  const str = JSON.stringify(m).toLowerCase();
  keywords.forEach(k => {
    if (str.includes(k.toLowerCase())) foundInMembers.add(k);
  });
});

console.log('Matches in Registrations:', Array.from(foundInRegs));
console.log('Matches in Members:', Array.from(foundInMembers));

// If any found, let's print the actual objects
if (foundInRegs.size > 0 || foundInMembers.size > 0) {
  console.log('\n--- Details ---');
  dump.registrations.forEach((r: any) => {
    const str = JSON.stringify(r).toLowerCase();
    if (keywords.some(k => str.includes(k.toLowerCase()))) {
      console.log('REG:', r.school_name);
    }
  });
  dump.members.forEach((m: any) => {
    const str = JSON.stringify(m).toLowerCase();
    if (keywords.some(k => str.includes(k.toLowerCase()))) {
      console.log('MEMBER:', m.name, 'in reg_id', m.registration_id);
    }
  });
}
