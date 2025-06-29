import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc } from './utils/trpc';

export function Users() {
  const users = useQuery(trpc.user.list.queryOptions());

  const [nameToCreate, setNameToCreate] = useState('');
  const [idToUpdate, setIdToUpdate] = useState('');
  const [nameToUpdate, setNameToUpdate] = useState('');

  const { mutate: createUser } = useMutation(
    trpc.user.create.mutationOptions({
      onSuccess: () => {
        setNameToCreate('');
        void users.refetch();
      },
      onError: (error) => {
        if (error.data?.customCode === 'NAME_ALREADY_TAKEN') {
          window.alert(
            `Name already taken by user with ID: ${error.data.customData.id}`,
          );
        } else {
          window.alert(`Unexpected error: ${error.message}`);
        }
      },
    }),
  );

  const { mutate: updateUser } = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        setIdToUpdate('');
        setNameToUpdate('');
        void users.refetch();
      },
      onError: (error) => {
        if (error.data?.customCode === 'NAME_ALREADY_TAKEN') {
          window.alert(
            `Name already taken by user with ID: ${error.data.customData.id}`,
          );
        } else if (error.data?.customCode === 'USER_NOT_FOUND') {
          window.alert(`User with ID "${idToUpdate}" not found`);
        } else {
          window.alert(`Unexpected error: ${error.message}`);
        }
      },
    }),
  );

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          createUser({ name: nameToCreate });
        }}
      >
        <h2>Create User</h2>

        <label htmlFor="nameToCreate">Name</label>
        <input
          id="nameToCreate"
          type="text"
          value={nameToCreate}
          onChange={(e) => setNameToCreate(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          updateUser({ id: idToUpdate, name: nameToUpdate });
        }}
      >
        <h2>Update User</h2>

        <label htmlFor="idToUpdate">ID</label>
        <input
          id="idToUpdate"
          type="text"
          value={idToUpdate}
          onChange={(e) => setIdToUpdate(e.target.value)}
        />

        <label htmlFor="nameToUpdate">Name</label>
        <input
          id="nameToUpdate"
          type="text"
          value={nameToUpdate}
          onChange={(e) => setNameToUpdate(e.target.value)}
        />
        <button type="submit">Update</button>
      </form>

      <div>
        <h2>Users</h2>
        <ul>
          {users.data?.map((user) => (
            <li key={user.id}>
              {user.id}: {user.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
