
#include "ev.h"

int err();

struct ev_timer * new_timer(struct ev_loop * the_loop, void (*cb)(struct ev_loop *loop, struct ev_timer *watcher, int revents), double after);
void free_timer(struct ev_timer * the_timer);

