# Angefangene Rätsel sichtbar machen

**Datum:** 2026-09-21
**Zweig:** `redesign/mobile-canvas-overview`
**Zustand:** offen — noch nicht geplant, noch nicht gebaut

## Worum es geht

Man soll seinen Stand **nie** verlieren, und man soll sehen, wo man ihn hat.

Heute weiß die App mehr, als sie zeigt: Markierungen liegen je Rätsel im
lokalen Speicher, überleben ein Neuladen und werden beim Aufgeben eines Duells
sogar ins Einzelspiel übertragen. Sichtbar ist davon genau eine Sache — der
Knopf „Weiterspielen" auf dem Startbildschirm, und der zeigt auf **ein**
Rätsel.

In der Sammlung ist jeder Eintrag entweder „gelöst" oder leer. Ein Kapitel, in
dem man drei Rätsel angefangen und keines beendet hat, sieht genauso aus wie
ein unberührtes.

## Was fehlt

1. **In der Sammlung**: je Eintrag sichtbar, ob er angefangen ist und wie weit
   — etwa „34 % gefüllt" oder ein Balken. Drei Zustände statt zwei: unberührt,
   angefangen, gelöst.
2. **Der Weiterspielen-Knopf** soll das zuletzt begonnene Rätsel meinen, nicht
   irgendeines. (Ob er das heute schon tut, ist zu prüfen — `loadResume`
   führt einen einzigen Datensatz je Spieler, also vermutlich ja, aber der
   wird bei jedem neuen Spiel überschrieben.)

## Was vorher zu klären ist

**Wie viele Stände gibt es überhaupt?** Der Speicherschlüssel lautet

```
logicals:play:${mode}:${room}:${player}:${puzzle.id}:${puzzle.seed}:${dimensions}:${clues}
```

Es liegt also je Rätsel und Spieler ein eigener Eintrag — beliebig viele
nebeneinander. Die Sammlung könnte sie finden, müsste dafür aber den
Speicher durchsuchen statt einen Schlüssel zu bilden. Das ist die
Entwurfsfrage: gezielt nachschlagen (Schlüssel aus dem Katalogeintrag
berechnen) oder einmal alles durchgehen und einen Index halten.

**Wann gilt ein Rätsel als angefangen?** Eine einzige Markierung? Der
Fortsetzungs-Datensatz löscht sich selbst bei `marks.size === 0` — dieselbe
Schwelle wäre folgerichtig.

**Was zeigt der Prozentsatz?** Gefüllte Zellen durch alle Zellen ist
irreführend: ein gelöstes 5×5 hat 250 Zellen, von denen die meisten Kreuze
sind, und automatische Kreuze zählen mit. Ehrlicher wäre der Anteil der
sicheren Zuordnungen an ihrer Gesamtzahl — davon gibt es genau
`valuesPerCategory · C(categoryCount, 2)`.

**Räumt das jemand auf?** Stände sammeln sich sonst unbegrenzt an. Wer 120
Sammlungsrätsel anfängt, hat 120 Einträge im lokalen Speicher. Das ist
verkraftbar, aber es gehört entschieden statt übersehen.

## Warum es wartet

Es ist ein eigenes Vorhaben, kein Anhängsel. Der Duell-Umbau läuft noch, und
diese Sache berührt Sammlung, Startbildschirm und Speicherverwaltung
gleichzeitig.
