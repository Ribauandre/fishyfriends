import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread from './CommentThread';

const comments = [
  { id: 'c1', user_id: 'user-a', author_name: 'Andres', body: 'Nice fish!' },
  { id: 'c2', user_id: 'user-b', author_name: 'Kevin', body: 'Beat that.' },
];

test('toggle button opens and closes the comment list, showing a count', async () => {
  render(<CommentThread comments={comments} loading={false} onAdd={jest.fn()} />);
  expect(screen.getByRole('button', { name: /comments \(2\)/i })).toBeInTheDocument();
  expect(screen.queryByText('Nice fish!')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /comments \(2\)/i }));
  expect(screen.getByText('Nice fish!')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /hide comments/i }));
  expect(screen.queryByText('Nice fish!')).not.toBeInTheDocument();
});

test('defaultOpen starts the thread expanded, for a post reached via a deep link', () => {
  render(<CommentThread comments={comments} loading={false} onAdd={jest.fn()} defaultOpen />);
  expect(screen.getByText('Nice fish!')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /hide comments/i })).toBeInTheDocument();
});

test('shows a loading state and an empty state appropriately', async () => {
  const { rerender } = render(<CommentThread comments={[]} loading onAdd={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  expect(screen.getByText(/loading comments/i)).toBeInTheDocument();

  rerender(<CommentThread comments={[]} loading={false} onAdd={jest.fn()} />);
  expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
});

test('only shows a delete button on the viewer\'s own comment', async () => {
  render(<CommentThread comments={comments} loading={false} onAdd={jest.fn()} onDelete={jest.fn()} currentUserId="user-b" />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  expect(screen.getAllByRole('button', { name: /delete comment/i })).toHaveLength(1);
});

test('shows no delete buttons at all without an onDelete handler, even with a currentUserId', async () => {
  render(<CommentThread comments={comments} loading={false} onAdd={jest.fn()} currentUserId="user-a" />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  expect(screen.queryByRole('button', { name: /delete comment/i })).not.toBeInTheDocument();
});

test('clicking delete calls onDelete with that comment\'s id', async () => {
  const onDelete = jest.fn();
  render(<CommentThread comments={comments} loading={false} onAdd={jest.fn()} onDelete={onDelete} currentUserId="user-b" />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  await userEvent.click(screen.getByRole('button', { name: /delete comment/i }));
  expect(onDelete).toHaveBeenCalledWith('c2');
});

test('submitting the form calls onAdd with the trimmed draft and clears it on success', async () => {
  const onAdd = jest.fn().mockResolvedValue({ error: null });
  render(<CommentThread comments={[]} loading={false} onAdd={onAdd} />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  const input = screen.getByPlaceholderText(/add a comment/i);
  await userEvent.type(input, '  Great catch  ');
  await userEvent.click(screen.getByRole('button', { name: /post/i }));
  expect(onAdd).toHaveBeenCalledWith('Great catch');
  await waitFor(() => expect(input).toHaveValue(''));
});

test('does not clear the draft if onAdd reports an error', async () => {
  const onAdd = jest.fn().mockResolvedValue({ error: new Error('nope') });
  render(<CommentThread comments={[]} loading={false} onAdd={onAdd} />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  const input = screen.getByPlaceholderText(/add a comment/i);
  await userEvent.type(input, 'Still here');
  await userEvent.click(screen.getByRole('button', { name: /post/i }));
  expect(input).toHaveValue('Still here');
});

test('the Post button is disabled while the draft is empty', async () => {
  render(<CommentThread comments={[]} loading={false} onAdd={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /comments/i }));
  expect(screen.getByRole('button', { name: /post/i })).toBeDisabled();
  await userEvent.type(screen.getByPlaceholderText(/add a comment/i), 'x');
  expect(screen.getByRole('button', { name: /post/i })).toBeEnabled();
});
