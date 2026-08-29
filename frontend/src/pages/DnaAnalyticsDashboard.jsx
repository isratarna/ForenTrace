import React, { useState, useEffect } from 'react';

const OVERVIEW_API = 'http://localhost:8000/api/analytics/dna/technician-overview';
const CAPACITY_API = 'http://localhost:8000/api/analytics/dna/lab-capacity';
const ABOVE_AVG_API = 'http://localhost:8000/api/analytics/dna/above-average-labs';

export default function DnaAnalyticsDashboard() {
    const [activeTab, setActiveTab] = useState('overview');
    const [overviewData, setOverviewData] = useState([]);
    const [capacityData, setCapacityData] = useState([]);
    const [aboveAvgData, setAboveAvgData] = useState([]);
    const [minTechFilter, setMinTechFilter] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            setError('');
            const [resOverview, resCapacity, resAboveAvg] = await Promise.all([
                fetch(OVERVIEW_API, { credentials: 'include' }),
                fetch(CAPACITY_API, { credentials: 'include' }),
                fetch(ABOVE_AVG_API, { credentials: 'include' })
            ]);

            const [dataOverview, dataCapacity, dataAboveAvg] = await Promise.all([
                resOverview.json(),
                resCapacity.json(),
                resAboveAvg.json()
            ]);

            if (dataOverview.success) setOverviewData(dataOverview.data);
            if (dataCapacity.success) setCapacityData(dataCapacity.data);
            if (dataAboveAvg.success) setAboveAvgData(dataAboveAvg.data);
        } catch (err) {
            setError('Failed to fetch analytics reports from server');
        } finally {
            setLoading(false);
        }
    };

    const handleCapacityFilter = async (minVal) => {
        setMinTechFilter(minVal);
        try {
            const res = await fetch(`${CAPACITY_API}?minTech=${minVal}`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setCapacityData(data.data);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>DNA Analytics & Staffing Intelligence</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                CP2 Raw SQL Query Demonstrations: Multitable JOIN, GROUP BY / HAVING, and Nested Subqueries.
            </p>

            {error && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {/* Summary Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>TOTAL REGISTERED STAFF</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e3a8a', marginTop: '4px' }}>{overviewData.length}</div>
                    <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>Multitable JOIN Coverage</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#166534', fontWeight: '600' }}>TOTAL DNA LABS</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#14532d', marginTop: '4px' }}>{capacityData.length}</div>
                    <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>Aggregated Laboratories</div>
                </div>
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#6b21a8', fontWeight: '600' }}>ABOVE-AVG CAPACITY LABS</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#581c87', marginTop: '4px' }}>{aboveAvgData.length}</div>
                    <div style={{ fontSize: '12px', color: '#a855f7', marginTop: '4px' }}>Subquery Filtered Results</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'none',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'overview' ? '3px solid #2563eb' : '3px solid transparent',
                        color: activeTab === 'overview' ? '#2563eb' : '#64748b'
                    }}
                >
                    Query 1: Multitable Staff Overview (JOIN)
                </button>
                <button
                    onClick={() => setActiveTab('capacity')}
                    style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'none',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'capacity' ? '3px solid #2563eb' : '3px solid transparent',
                        color: activeTab === 'capacity' ? '#2563eb' : '#64748b'
                    }}
                >
                    Query 2: Lab Staffing Capacity (GROUP BY & HAVING)
                </button>
                <button
                    onClick={() => setActiveTab('subquery')}
                    style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'none',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'subquery' ? '3px solid #2563eb' : '3px solid transparent',
                        color: activeTab === 'subquery' ? '#2563eb' : '#64748b'
                    }}
                >
                    Query 3: Above Average Labs (Subquery)
                </button>
            </div>

            {loading ? (
                <p>Loading analytics data...</p>
            ) : (
                <>
                    {/* TAB 1: Multitable JOIN */}
                    {activeTab === 'overview' && (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: '600', fontSize: '14px' }}>
                                Relational Mapping: `dna_labs` ⨝ `lab_technicians` ⟕ `users`
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                <thead style={{ background: '#f1f5f9' }}>
                                    <tr>
                                        <th style={{ padding: '12px' }}>Staff Name</th>
                                        <th style={{ padding: '12px' }}>Designation</th>
                                        <th style={{ padding: '12px' }}>Assigned DNA Lab</th>
                                        <th style={{ padding: '12px' }}>Lab City</th>
                                        <th style={{ padding: '12px' }}>Contact</th>
                                        <th style={{ padding: '12px' }}>System Account</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewData.map((row) => (
                                        <tr key={row.technician_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '12px', fontWeight: '500' }}>{row.technician_name}</td>
                                            <td style={{ padding: '12px' }}>{row.designation}</td>
                                            <td style={{ padding: '12px' }}>{row.lab_name}</td>
                                            <td style={{ padding: '12px' }}>{row.lab_city}</td>
                                            <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                                                <div>{row.technician_email}</div>
                                                <div>{row.technician_phone}</div>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                {row.username ? (
                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                                        @{row.username} ({row.account_status})
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>Unlinked</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* TAB 2: GROUP BY & HAVING */}
                    {activeTab === 'capacity' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <label style={{ fontSize: '14px', fontWeight: '500' }}>Filter by Min Technicians (HAVING clause):</label>
                                <select
                                    value={minTechFilter}
                                    onChange={(e) => handleCapacityFilter(e.target.value)}
                                    style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="0">All Labs (HAVING &ge; 0)</option>
                                    <option value="1">At least 1 Technician (HAVING &ge; 1)</option>
                                    <option value="2">At least 2 Technicians (HAVING &ge; 2)</option>
                                </select>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                    <thead style={{ background: '#f1f5f9' }}>
                                        <tr>
                                            <th style={{ padding: '12px' }}>Lab ID</th>
                                            <th style={{ padding: '12px' }}>Laboratory Name</th>
                                            <th style={{ padding: '12px' }}>Location / City</th>
                                            <th style={{ padding: '12px' }}>Contact Hotline</th>
                                            <th style={{ padding: '12px' }}>Total Assigned Staff</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {capacityData.map((lab) => (
                                            <tr key={lab.lab_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '12px', fontWeight: 'bold' }}>#{lab.lab_id}</td>
                                                <td style={{ padding: '12px', fontWeight: '500' }}>{lab.lab_name}</td>
                                                <td style={{ padding: '12px' }}>{lab.city}</td>
                                                <td style={{ padding: '12px' }}>{lab.contact_number}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{
                                                        background: lab.total_technicians > 0 ? '#dcfce7' : '#fee2e2',
                                                        color: lab.total_technicians > 0 ? '#166534' : '#991b1b',
                                                        padding: '3px 10px',
                                                        borderRadius: '12px',
                                                        fontWeight: '600'
                                                    }}>
                                                        {lab.total_technicians} Technicians
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Nested Subquery */}
                    {activeTab === 'subquery' && (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: '#faf5ff', borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#581c87' }}>
                                Displaying labs where staff count is greater than or equal to the calculated subquery system average.
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                <thead style={{ background: '#f1f5f9' }}>
                                    <tr>
                                        <th style={{ padding: '12px' }}>Lab ID</th>
                                        <th style={{ padding: '12px' }}>Laboratory Name</th>
                                        <th style={{ padding: '12px' }}>City</th>
                                        <th style={{ padding: '12px' }}>Technician Count</th>
                                        <th style={{ padding: '12px' }}>Calculated System Average</th>
                                        <th style={{ padding: '12px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aboveAvgData.map((lab) => (
                                        <tr key={lab.lab_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '12px', fontWeight: 'bold' }}>#{lab.lab_id}</td>
                                            <td style={{ padding: '12px', fontWeight: '500' }}>{lab.lab_name}</td>
                                            <td style={{ padding: '12px' }}>{lab.city}</td>
                                            <td style={{ padding: '12px', fontWeight: 'bold', color: '#16a34a' }}>{lab.technician_count} Staff</td>
                                            <td style={{ padding: '12px', color: '#64748b' }}>{lab.system_avg_technicians} Staff / Lab</td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>
                                                    &ge; Average
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}