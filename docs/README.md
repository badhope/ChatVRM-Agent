# Documentation Directory

Welcome to the Personal-Assistant documentation!

## 📚 Documentation Overview

### Architecture & Design
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Complete architecture overview and design principles
- **[FINAL_ARCHITECTURE_SUMMARY.md](FINAL_ARCHITECTURE_SUMMARY.md)** — Final DDD architecture migration summary
- **[CODE_STRUCTURE_ANALYSIS.md](CODE_STRUCTURE_ANALYSIS.md)** — Detailed code structure analysis
- **[tool-library-design.md](tool-library-design.md)** — Tool library design documentation
- **[technical-roadmap.md](technical-roadmap.md)** — Technical roadmap and future plans

### Development & Setup
- **[SETUP.md](SETUP.md)** — Complete project setup guide for developers
- **[GIT_GUIDELINES.md](GIT_GUIDELINES.md)** — Git commit conventions and workflow
- **[PERFORMANCE_MONITORING.md](PERFORMANCE_MONITORING.md)** — Performance monitoring and debugging setup
- **[DEPENDENCIES_ASSESSMENT.md](DEPENDENCIES_ASSESSMENT.md)** — Dependencies assessment and security considerations
- **[completeness-checklist.md](completeness-checklist.md)** — Completeness checklist for features

### Refactoring History (Legacy)
The following documents were part of the refactoring process and are kept for reference:
- **[FINAL_REFACTORING_SUMMARY.md](FINAL_REFACTORING_SUMMARY.md)** — Refactoring summary
- **[IMPROVEMENT_SUMMARY.md](IMPROVEMENT_SUMMARY.md)** — Improvements made
- **[REFACTORING_PROGRESS_SUMMARY.md](REFACTORING_PROGRESS_SUMMARY.md)** — Progress during refactoring
- **[REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)** — Summary of refactoring work
- **[PHASE_2_PLAN.md](PHASE_2_PLAN.md)** — Phase 2 execution plan
- **[PHASE_5_EXECUTION_PLAN.md](PHASE_5_EXECUTION_PLAN.md)** — Phase 5 execution plan
- **[DETAILED_EXECUTION_PLAN.md](DETAILED_EXECUTION_PLAN.md)** — Detailed execution plan

## 🎯 Quick Links

- [Main Project README](../README.md) — Project overview and getting started
- [Main Project README (Chinese)](../README_zh.md) — 中文项目概览
- [Contributing Guide](../CONTRIBUTING.md) — How to contribute to the project

## 🏗️ Architecture Highlights

### DDD Four-Layer Architecture
```
src/agent/
├── domain/              # Domain Layer (Business Logic)
│   ├── models/          # Domain Models
│   ├── services/        # Domain Services
│   └── repositories/    # Repository Interfaces
├── application/         # Application Layer (Use Cases)
│   ├── services/        # Application Services
│   └── dtos/            # Data Transfer Objects
├── infrastructure/      # Infrastructure Layer
│   ├── repositories/    # Repository Implementations
│   └── state-machines/  # State Machines
└── interfaces/          # Interface Layer
    └── controllers/     # Controllers
```

### Key Features
- ✅ Type-Safe with Strict TypeScript
- ✅ 484+ Comprehensive Tests Passing
- ✅ Domain-Driven Design (DDD) Architecture
- ✅ Clean Architecture Principles
- ✅ Full Backward Compatibility

## 📖 Getting Started

If you're new to the project, start with:
1. [Main README](../README.md) — Installation and quick start
2. [ARCHITECTURE.md](ARCHITECTURE.md) — Understand the architecture

For contributors, check out:
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Contribution guidelines

## 🤝 Contributing to Documentation

Documentation improvements are welcome! Please follow:
- Keep documentation up-to-date with code changes
- Use clear and concise language
- Provide examples when appropriate
- Document all public APIs
