.PHONY: build clean install lint test

install:
	npm --prefix app install

build:
	npm --prefix app run build

test:
	npm --prefix app test

lint:
	@echo "No lint script is configured. Use 'npm --prefix app run typecheck' for the current static check." >&2
	@exit 1

clean:
	rm -rf app/dist desktop/dist desktop/src-tauri/target
