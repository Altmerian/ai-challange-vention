# Task

In this task you will build a Model Context Protocol server that works as an AI-ready Air Traffic Control system.

Your goal is to create a lightweight MCP server that can coordinate flight operations at a busy airport. The system should accept incoming flight plans, schedule arrivals and departures safely, manage limited airport resources, react to disruptions, and expose airport state to AI clients through MCP tools and resources.

The focus is on scheduling logic and coordination, not on building a visual interface or simulating real aircraft physics.

## Core Airport Operations

Anyone connected to the MCP server should be able to submit new flights.

A submitted flight includes:

- **flight number**
- **operation type** (arrivals or departures)
- **priority** (high, medium, or low)
- **dependencies** *[optional]*: flights can depend on other flights. For example, an outbound connecting flight should not depart before its inbound flight has completed.
- **runway requirements** *[optional]*: the server should schedule flights across available runways and gates while avoiding conflicts.

## Airport Configuration

Airport limits must be configured through environment variables.

Configuration should include:

- Runway count
- Gate count
- Ground crew count
- Runway separation buffers for takeoffs, landings, and mixed operations
- Gate turnaround time
- Dependency buffer time
- Maximum scheduling horizon

Invalid configuration should fail clearly at startup.

## MCP Interface

Your server must expose MCP **tools** that allow an AI client to:

- Submit a new arrival or departure.
- Generate or refresh the airport schedule — calling this tool replaces the current schedule with a freshly computed one based on the current flight queue and airport configuration.
- Get current airport status, including resource usage and flight counts.
- Cancel a flight and update affected dependent flights.
- Bottleneck analysis — identify the sequence of dependent flights that drives the total schedule duration.

Your server must also expose MCP **resources** that allow an AI client to inspect:

- The current flight queue, including unscheduled, and cancelled flights.
- Runway availability and usage information.
- A chronological timeline of scheduled airport operations.

You can choose the exact tool names, resource names, and data structures, as long as the capabilities are clearly documented and usable from an MCP-compatible client.

## Validation Scenarios

Here are a couple of validation scenarios for you to test your MCP server. Think about other validation scenarios as well to make sure your MCP server covers all the requirements and works as expected.

### Scenario 1: Morning Rush

**Goal:** Verify basic scheduling of mixed arrivals and departures.

**Steps:**

1. Start with a clean airport state.
2. Submit several flights with mixed operation types:
   - One high-priority arrival.
   - One medium-priority departure.
   - One low-priority arrival.
   - One low-priority departure.
3. Generate the airport schedule.
4. Inspect the flight queue.
5. Inspect the operation timeline.

**Expected result:**

- All schedulable flights should be scheduled.
- No runway or gate should have overlapping operations.
- Higher-priority flights should be scheduled earlier when resources are contested.
- The flight queue should clearly show whether any flights remain unscheduled.

### Scenario 2: Heavy Hauler

**Goal:** Verify that runway capability constraints are respected.

**Steps:**

1. Start with a clean airport state.
2. Submit a high-priority departure requiring a runway longer than any runway available at the airport.
3. Generate the airport schedule.
4. Inspect the flight queue and airport status.

**Expected result:**

- The oversized flight should not be scheduled.
- The flight should remain visible with an unscheduled status.
- The reason should clearly indicate that no suitable runway is available.
- Other valid flights, if present, should still be schedulable.

### Scenario 3: Connecting Flight

**Goal:** Verify dependency handling between flights.

**Steps:**

1. Start with a clean airport state.
2. Submit an inbound arrival.
3. Submit an outbound departure that depends on the inbound flight.
4. Generate the airport schedule.
5. Inspect the operation timeline.

**Expected result:**

- Both flights should be scheduled if resources are available.
- The outbound flight should not start before the inbound flight has completed.
- The configured dependency buffer should be respected.
- The timeline should make the dependency order clear.

## Requirements

### Application Behavior

- The MCP server starts successfully and all tools and resources are accessible to a connected MCP client.
- All airport limits are loaded from environment variables.
- Users can submit arrivals and departures with priorities and dependencies.
- Scheduling avoids overlapping usage of the same runway or gate.
- Scheduling respects runway requirements, gate availability, separation buffers, dependency buffers, and airport capacity limits.
- When resources are constrained, higher-priority flights should be scheduled earlier where possible.
- Flights that cannot be scheduled should remain visible with a clear reason.
- Cancelling a flight should mark it as cancelled and cause dependent operations to be re-evaluated.
- The airport status capability should return a structured operational status derived from the current airport state. It should include flight counts by state and operation type, runway and gate capacity/usage, resource constraint indicators, unscheduled or blocked flights with reasons, and the current schedule completion time when available.
- The bottleneck analysis capability should identify the longest active scheduled dependency chain, if one exists. The result should include the ordered flights in the chain and the total elapsed duration based on the generated schedule, accounting for operation durations and required dependency buffers.
- Repeated scheduling with the same inputs and configuration should produce deterministic results.

### Submission artifacts

Your GitHub repository must include:

- Source code for the MCP server in a `task-4` folder.
- A `README.md` covering: how to install dependencies and build the server, all environment variables and their accepted values, how to run the server and connect it from an MCP-compatible client, and a reference of all exposed tools and resources with a short description of each.
- A `report.md` covering: your scheduling approach and the key decisions behind it, tools and techniques used, and what worked and what did not.

Your repository must be public.
