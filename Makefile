.PHONY: server setup

# Default target: ensure setup is done, then start the server.
server: setup
	node html/server.js 8070

# Phony setup gate — depends on all non-phony data targets.
setup: clones/arc clones/concept-arc data/arc data/concept-arc clones/arc-dsl


# --- Clone targets (non-phony: skipped if directory already exists) ---

clones/arc:
	git clone https://github.com/fchollet/ARC-AGI.git clones/arc

clones/concept-arc:
	git clone https://github.com/victorvikram/ConceptARC.git clones/concept-arc

clones/arc-dsl:
	git clone https://github.com/michaelhodel/arc-dsl.git clones/arc-dsl

# --- Data copy targets (non-phony: skipped if directory already exists) ---

data/arc: clones/arc
	mkdir -p data/arc
	cp -r clones/arc/data/training data/arc/training
	cp -r clones/arc/data/evaluation data/arc/evaluation

data/concept-arc: clones/concept-arc
	mkdir -p data/concept-arc
	cp -r clones/concept-arc/corpus/. data/concept-arc/
