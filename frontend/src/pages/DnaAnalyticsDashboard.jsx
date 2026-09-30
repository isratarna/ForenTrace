import React, { useState, useEffect } from 'react';
import { MetricCard, PageHeader } from '../components/Ui'; // app er baki page er moto same component (UI Phase 2)

// Tab gula ekhane list kora — niche map kore button banano hoy (UI Phase 2)
const TABS = [
    ['overview', 'Query 1: Multitable Staff Overview (JOIN)'],
    ['capacity', 'Query 2: Lab Staffing Capacity (GROUP BY & HAVING)'],
    ['subquery', 'Query 3: Above Average Labs (Subquery)'],
];

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

    // Inline style er bodole Bootstrap class + app er component — tai dark theme automatic lage (UI Phase 2)
    return (
        <>
            <PageHeader
                title="DNA Analytics & Staffing Intelligence"
                subtitle="CP2 Raw SQL Query Demonstrations: Multitable JOIN, GROUP BY / HAVING, and Nested Subqueries."
            />

            {error && <div className="alert alert-danger">{error}</div>}

            {/* Summary Stat Cards */}
            <div className="row g-3 mb-4">
                <div className="col-md-4">
                    <MetricCard label="Total Registered Staff" value={overviewData.length} hint="Multitable JOIN Coverage" />
                </div>
                <div className="col-md-4">
                    <MetricCard label="Total DNA Labs" value={capacityData.length} hint="Aggregated Laboratories" tone="success" />
                </div>
                <div className="col-md-4">
                    <MetricCard label="Above-Avg Capacity Labs" value={aboveAvgData.length} hint="Subquery Filtered Results" />
                </div>
            </div>

            {/* Navigation Tabs */}
            <ul className="nav nav-tabs mb-3">
                {TABS.map(([key, label]) => (
                    <li className="nav-item" key={key}>
                        <button
                            type="button"
                            className={`nav-link ${activeTab === key ? 'active' : ''}`}
                            onClick={() => setActiveTab(key)}
                        >
                            {label}
                        </button>
                    </li>
                ))}
            </ul>

            {loading ? (
                <p className="text-secondary">Loading analytics data...</p>
            ) : (
                <>
                    {/* TAB 1: Multitable JOIN */}
                    {activeTab === 'overview' && (
                        <div className="card">
                            <div className="card-header">
                                <strong>Relational Mapping: `dna_labs` ⨝ `lab_technicians` ⟕ `users`</strong>
                            </div>
                            <div className="table-responsive">
                                <table className="table table-hover mb-0">
                                    <thead>
                                        <tr>
                                            <th>Staff Name</th>
                                            <th>Designation</th>
                                            <th>Assigned DNA Lab</th>
                                            <th>Lab City</th>
                                            <th>Contact</th>
                                            <th>System Account</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {overviewData.map((row) => (
                                            <tr key={row.technician_id}>
                                                <td className="fw-semibold">{row.technician_name}</td>
                                                <td>{row.designation}</td>
                                                <td>{row.lab_name}</td>
                                                <td>{row.lab_city}</td>
                                                <td className="small text-secondary">
                                                    <div>{row.technician_email}</div>
                                                    <div>{row.technician_phone}</div>
                                                </td>
                                                <td>
                                                    {row.username ? (
                                                        <span className="badge text-bg-primary status-badge">
                                                            @{row.username} ({row.account_status})
                                                        </span>
                                                    ) : (
                                                        <span className="small text-secondary">Unlinked</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: GROUP BY & HAVING */}
                    {activeTab === 'capacity' && (
                        <>
                            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                                <label className="form-label mb-0" htmlFor="minTechFilter">Filter by Min Technicians (HAVING clause):</label>
                                <select
                                    id="minTechFilter"
                                    className="form-select w-auto"
                                    value={minTechFilter}
                                    onChange={(e) => handleCapacityFilter(e.target.value)}
                                >
                                    <option value="0">All Labs (HAVING &ge; 0)</option>
                                    <option value="1">At least 1 Technician (HAVING &ge; 1)</option>
                                    <option value="2">At least 2 Technicians (HAVING &ge; 2)</option>
                                </select>
                            </div>

                            <div className="card">
                                <div className="table-responsive">
                                    <table className="table table-hover mb-0">
                                        <thead>
                                            <tr>
                                                <th>Lab ID</th>
                                                <th>Laboratory Name</th>
                                                <th>Location / City</th>
                                                <th>Contact Hotline</th>
                                                <th>Total Assigned Staff</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {capacityData.map((lab) => (
                                                <tr key={lab.lab_id}>
                                                    <td className="fw-semibold">#{lab.lab_id}</td>
                                                    <td>{lab.lab_name}</td>
                                                    <td>{lab.city}</td>
                                                    <td>{lab.contact_number}</td>
                                                    <td>
                                                        {/* Technician thakle shobuj, na thakle lal badge */}
                                                        <span className={`badge status-badge ${lab.total_technicians > 0 ? 'text-bg-success' : 'text-bg-danger'}`}>
                                                            {lab.total_technicians} Technicians
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* TAB 3: Nested Subquery */}
                    {activeTab === 'subquery' && (
                        <div className="card">
                            <div className="card-header small text-secondary">
                                Displaying labs where staff count is greater than or equal to the calculated subquery system average.
                            </div>
                            <div className="table-responsive">
                                <table className="table table-hover mb-0">
                                    <thead>
                                        <tr>
                                            <th>Lab ID</th>
                                            <th>Laboratory Name</th>
                                            <th>City</th>
                                            <th>Technician Count</th>
                                            <th>Calculated System Average</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {aboveAvgData.map((lab) => (
                                            <tr key={lab.lab_id}>
                                                <td className="fw-semibold">#{lab.lab_id}</td>
                                                <td>{lab.lab_name}</td>
                                                <td>{lab.city}</td>
                                                <td className="fw-semibold text-success">{lab.technician_count} Staff</td>
                                                <td className="text-secondary">{lab.system_avg_technicians} Staff / Lab</td>
                                                <td>
                                                    <span className="badge text-bg-primary status-badge">&ge; Average</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}