import * as React from 'react';
import { styled } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import flounderPlaceholder from "../assets/cartoon-flounder-isolated-on-white-vector-46294379.jpg"
import andresFluke from "../assets/andres/15-and-a-half-05-25.jpeg"

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: theme.palette.common.black,
    color: theme.palette.common.white,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
    color: theme.palette.common.white,
  },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '&:nth-of-type(odd)': {
    backgroundColor: theme.palette.action.hover,
  },
  // hide last border
  '&:last-child td, &:last-child th': {
    border: 0,
  },
}));


function createData(
  position: number,
  name: string,
  size: number,
  date,
  photo,
) {
  return { position, name, size, date, photo };
}

const rows = [
  createData(1, "Andres", 15.5, "05/25", <img src={andresFluke} width={300}></img>),
  createData(2, "placeholder", 18, "05/06", <img src={flounderPlaceholder} width={300}></img>),
  createData(3, "placeholder", 17, "05/13", <img src={flounderPlaceholder} width={300}></img>),
];

export default function Leaderboard() {
  return (
    <TableContainer>
      <Table sx={{ minWidth: 750 }}>
        <TableHead>
          <TableRow>
            <StyledTableCell>#</StyledTableCell>
            <StyledTableCell>Name</StyledTableCell>
            <StyledTableCell>Size</StyledTableCell>
            <StyledTableCell>Date</StyledTableCell>
            <StyledTableCell align="center">Photo</StyledTableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <StyledTableRow
              key={row.name}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <StyledTableCell>{row.position}</StyledTableCell>
              <StyledTableCell>{row.name}</StyledTableCell>
              <StyledTableCell>{row.size}</StyledTableCell>
              <StyledTableCell>{row.date}</StyledTableCell>
              <StyledTableCell align="center">{row.photo}</StyledTableCell>
            </StyledTableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}