import React from 'react';
import { PageHeader } from '../components/Ui';
import FamilyMembersManager from '../components/FamilyMembersManager';

export default function FamilyMembersPage() {
  return (
    <>
      <PageHeader
        title="Family Members"
        subtitle="Manage family contacts of missing persons and register reference DNA samples"
      />
      <FamilyMembersManager />
    </>
  );
}