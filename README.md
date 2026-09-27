# Common Room

Common Room is an independent student prototype for finding and booking a study space around an ANU campus day. Start with a date, time, duration and the number of people coming. Compare spaces that fit the whole session, review a choice, and keep or cancel the reservation from My bookings.

This is a COMP4020 Crit 7 project, not an ANU booking service. Its space catalogue, facilities, opening hours and availability are illustrative. A booking here is saved in this prototype only; it does not reserve a university room. For a real reservation, use [ANU Library bookings](https://anu.libcal.com/).

## What good looks like here

The question behind this project is specific: where can four people work together for one uninterrupted hour? In the existing Chifley booking interface, the accessible search's “1–4 people” capacity option returned 63 choices across all categories during inspection, including spaces for one and two people. The main timetable offers an overview, but finding a suitable uninterrupted period still means comparing rows and times. The existing service already has category, capacity and equipment filters; those are useful features to build on.

Common Room puts the intended session first. Every result must have enough seats and show whether the entire requested interval is free. A full slot has nearby alternatives. The selected criteria remain visible through the journey, and a failed booking keeps them available for another choice. A reservation must still be there after a reload, and two people must not be able to reserve overlapping time in the same space.

These are functional promises, protected by checks in `spec/`. Whether the layout makes comparison easier, the wording is clear, and the motion helps a person understand a change remain questions for using the interface. The research and verification record separates observed behavior from those judgements in [docs/RESEARCH.md](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-naaeeen/blob/main/docs/RESEARCH.md).

## Using this prototype

- Choose a time in Canberra's time zone, a session of 30, 60, 90 or 120 minutes, and a group of up to eight people.
- Browse the illustrative rooms, booths and desks across four libraries. Optional library, space-type and facilities filters narrow the choices.
- Review the space and session before confirming. My bookings shows your confirmation and reservation reference.
- Cancel a future reservation to release its time. A reservation that has started cannot be cancelled.

The prototype uses sample opening hours of 07:00–23:00 and accepts dates from today through 14 days ahead. Each demo account, saved in the current browser, can hold at most two confirmed reservations that have not ended, including an ongoing session. It can hold up to 120 confirmed minutes on a date. Cancelling before a session starts releases its reservation slot and daily allowance. These are explicit prototype rules, not a claim that every ANU space follows one policy.

## Returning to a booking

Reservations are stored on the server. An essential browser cookie connects this browser to its own bookings for up to 60 days. We do not collect your name, email, student number or ANU password. Other visitors cannot view or cancel your reservations. Clearing this site's cookies, using a different browser or waiting for the cookie to expire removes access to them; this prototype has no account-recovery service.

Availability changes can notify another open tab without revealing who made a booking. Search and reservation forms also work without JavaScript. Optional transitions explain selection and confirmation, and respect reduced-motion preferences.

## Research and implementation

The [Crit 7 brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/) asks for one real ANU-system slice connected end to end. This project keeps the provided Astro, Drizzle and SQLite stack and the course-managed Fly deployment. Data belongs on the persistent volume, and schema changes travel as committed migrations. The original invariant, README, streaming and origin-protection checks remain part of the contract.

The [Chifley desk and booth trial](https://anulib.anu.edu.au/news-events/news/bookable-spaces-chifley-library) has its own check-in rules. This prototype does not infer or automate real-world no-show decisions. Its research basis is the public course and library documentation, supplied screenshots, and read-only inspection of the existing booking interface in Edge. No real ANU booking was created or cancelled during that inspection.

The ANU wordmark is the original logo served by the university's [website assets](https://marketing-pages.anu.edu.au/_anu/4/images/logos/anu_logo_print.png). It identifies the campus context; Common Room remains an independent COMP4020 student project.
