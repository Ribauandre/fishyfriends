import * as React from 'react';
import IconButton from '@mui/joy/IconButton';
import Table from '@mui/joy/Table';
import Typography from '@mui/joy/Typography';
import Sheet from '@mui/joy/Sheet';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import placeholderFluke from "../assets/cartoon-flounder-isolated-on-white-vector-46294379.jpg"
import firstPlace from "../assets/andres/15-and-a-half-05-25.jpeg"


function createData(
  place: number,
  name: string,
  size: number,
  date: string,
) {
  return {
    place,
    name,
    size,
    date,
    photo: [
      {
        photo: [placeholderFluke]
      },
    ],
  };
}

function Row(props: { row: ReturnType<typeof createData>; initialOpen?: boolean }) {
  const { row } = props;
  const [open, setOpen] = React.useState(props.initialOpen || false);

  return (
    <React.Fragment>
      <tr>
        <td>
          <IconButton
            aria-label="expand row"
            variant="plain"
            color="primary"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </td>
        <th scope="row" style={{color: "white", backgroundColor: "black"}}>{row.place}</th>
        <td>{row.name}</td>
        <td>{row.size}</td>
        <td>{row.date}</td>
      </tr>
      <tr>
        <td style={{ height: 0, padding: 0 }}>
          {open && (
            <Sheet
              variant="soft"
              sx={{
                  'textAlign': 'center',
                  'background-color': 'black',
                  'color': 'white',
                }}
            >
              <Table
                borderAxis="bothBetween"
                size="sm"
                aria-label="photo"
                sx={{
                  'textAlign': 'center',
                  'background-color': 'black',
                  'color': 'white',
                }}
              >
                <tbody>
                  {row.photo.map((photoRow) => (
                    <tr key={row.place} >
                      {row.place == 1 &&
                        <td><img src={firstPlace} width={300}></img></td>
                      }
                      {row.place == 2 &&
                        <td><img src={placeholderFluke} width={300}></img></td>
                      }
                      {row.place == 3 &&
                        <td><img src={placeholderFluke} width={300}></img></td>
                      }
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </td>
      </tr>
    </React.Fragment>
  );
}

const rows = [
  createData(1, "Andres", 15.5, "05/25"),
  createData(2, "placeholder", 15, "05/04"),
  createData(3, "placeholder", 14, "05/05"),
];

export default function Leaderboard() {
  return (
    <Sheet
      variant="soft"
      sx={{
                  'textAlign': 'center',
                  'background-color': 'black',
                  'color': 'white',
                }}
    >
      <Table
        aria-label="leaderboard"
        sx={{
                  'textAlign': 'center',
                  'background-color': 'black',
                  'color': 'white',
                }}
      >
        <thead style={{  }}>
          <tr>
            <th style={{width: 40, backgroundColor: "black"}} aria-label="empty" />
            <th style={{width: 15, color: "white", backgroundColor: "black"}}>#</th>
            <th style={{color: "white", backgroundColor: "black"}}>Name</th>
            <th style={{color: "white", backgroundColor: "black"}}>Size</th>
            <th style={{color: "white", backgroundColor: "black"}}>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <Row key={row.name} row={row} />
          ))}
        </tbody>
      </Table>
    </Sheet>
  );
}