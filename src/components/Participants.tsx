import * as React from 'react';
import andresJan from '../assets/andres/jan.jpeg';
import paoloFeb from '../assets/paolo/feb.jpeg';
import paoloJan from '../assets/paolo/jan.jpeg';
import andreFeb from '../assets/andre/feb.jpeg';
import andresFeb from '../assets/andres/feb.jpeg';
import IconButton from '@mui/joy/IconButton';
import Table from '@mui/joy/Table';
import Sheet from '@mui/joy/Sheet';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

const entriesByMonth: Record<string, Array<{name: string; species: string; date: string; photo?: string}>> = {
  'January': [
    { name: 'Andres', species: 'SteelHead', date: '1/16', photo: andresJan },
    { name: 'Paolo', species: 'SteelHead', date: '1/17', photo: paoloJan }
  ],
  'February': [
    { name: 'Paolo', species: 'Atlantic Salmon', date: '2/15', photo: paoloFeb },
    { name: 'Andre', species: 'Atlantic Salmon', date: '2/15', photo: andreFeb },
    { name: 'Andres', species: 'Brown Trout', date: '2/16', photo: andresFeb }
  ]
};

function MonthRow(props: { month: string }) {
  const { month } = props;
  const [open, setOpen] = React.useState(false);
  const entries = entriesByMonth[month] || [];

  return (
    <>
      <tr>
        <td>
          <IconButton
            aria-label="expand month"
            variant="plain"
            color="primary"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </td>
        <th scope="row" style={{ color: 'white', backgroundColor: 'black' }}>{month}</th>
      </tr>
      <tr>
        <td style={{ height: 0, padding: 0 }} colSpan={2}>
          {open && (
            <Sheet variant="soft" sx={{ textAlign: 'center', backgroundColor: 'black', color: 'white', padding: 2 }}>
              <div style={{ padding: 8 }}>
                <strong>{month}</strong>
                {entries.length === 0 ? (
                  <p style={{ margin: '8px 0 0 0' }}>No entries for this month yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    {entries.map((e) => (
                      <div key={e.name} style={{ display: 'flex', gap: 16, alignItems: 'center', width: '100%' }}>
                        <div style={{ width: 140, textAlign: 'left', paddingLeft: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{e.name}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                          <img src={e.photo} alt={`${e.name} fish`} style={{ maxWidth: 220, borderRadius: 6 }} />
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600 }}>Species: <span style={{ fontWeight: 400 }}>{e.species}</span></div>
                            <div style={{ fontWeight: 600 }}>Date: <span style={{ fontWeight: 400 }}>{e.date}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Sheet>
          )}
        </td>
      </tr>
    </>
  );
}

const months = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

export default function Participants() {
  return (
    <Sheet variant="soft" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white' }}>
        {/* Summary table: participants vs months */}
      <div style={{ height: 24 }} />
      <Table aria-label="summary" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white' }}>
        <thead>
          <tr>
            <th style={{ color: 'white', backgroundColor: 'black' }}>Name</th>
            {months.map((m) => (
              <th key={m} style={{ color: 'white', backgroundColor: 'black', textAlign: 'center' }}>{m.slice(0,3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // collect unique participant names from entriesByMonth
            const namesSet = new Set<string>();
            Object.values(entriesByMonth).flat().forEach(e => namesSet.add(e.name));
            const names = Array.from(namesSet);
            return names.map((name) => (
              <tr key={name}>
                <td style={{ color: 'white', backgroundColor: 'black' }}>{name}</td>
                {months.map((m) => {
                  const has = (entriesByMonth[m] || []).some(e => e.name === name);
                  return (
                    <td key={m} style={{ color: has ? '#8cffb2' : '#ff7b7b', textAlign: 'center', backgroundColor: 'black' }}>{has ? '𓆟' : '✕'}</td>
                  );
                })}
              </tr>
            ));
          })()}
        </tbody>
      </Table>
      <Table aria-label="months" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white' }}>
        <thead>
          <tr>
            <th style={{ width: 40, backgroundColor: 'black' }} aria-label="expand" />
            <th style={{ color: 'white', backgroundColor: 'black' }}>Month</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <MonthRow key={m} month={m} />
          ))}
        </tbody>
      </Table>
    </Sheet>
  );
}
